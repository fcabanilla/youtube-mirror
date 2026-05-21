/**
 * Generates output/report.html — visual web report for sharing.
 * Run: npm run report:html
 */

import fs from 'fs';
import type { Channel } from '../types.js';

const CHANNELS_FILE = 'output/channels.json';
const HTML_FILE = 'output/report.html';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_VISIBLE = 300;
const DEFAULT_N = 3;

// ── Taxonomy — single source of truth ────────────────────────────────────────
// Keys are sorted alphabetically within each parent (mirrors UI order).
const TAXONOMY: Record<string, { label: string; color: string; subs: Record<string, string> }> = {
  actualidad: {
    label: 'Actualidad y Política', color: '#e63946',
    subs: {
      argentina:   'Argentina',
      economia:    'Economía',
      geopolitica: 'Geopolítica',
      politica:    'Política general',
    },
  },
  arte: {
    label: 'Arte y Entretenimiento', color: '#8b5cf6',
    subs: {
      animacion:   'Animación y cómics',
      cine:        'Cine y series',
      cultura_pop: 'Cultura pop',
      humor:       'Humor y memes',
      lifestyle:   'Lifestyle y vlogs',
      misterio:    'Misterio y true crime',
      musica:      'Música',
      podcast:     'Podcasts y entrevistas',
      teatro:      'Teatro y artes',
    },
  },
  ciencias: {
    label: 'Ciencias', color: '#06b6d4',
    subs: {
      astronomia:  'Astronomía y espacio',
      aviacion:    'Aviación y aeronáutica',
      biologia:    'Biología y naturaleza',
      fisica:      'Física y química',
      geografia:   'Geografía',
      ingenieria:  'Ingeniería',
      matematicas: 'Matemáticas',
      medicina:    'Medicina y salud',
      psicologia:  'Psicología',
    },
  },
  deportes: {
    label: 'Deportes', color: '#16a34a',
    subs: {
      acuaticos:       'Deportes acuáticos',
      artes_marciales: 'Artes marciales',
      atletismo:       'Atletismo',
      automovilismo:   'Automovilismo real',
      ciclismo:        'Ciclismo',
      esports:         'Esports competitivos',
      futbol:          'Fútbol',
      general:         'General',
      golf:            'Golf',
      invierno:        'Deportes de invierno',
      rugby:           'Rugby y football americano',
      simracing:       'Simracing',
      tenis:           'Tenis',
    },
  },
  educacion: {
    label: 'Educación', color: '#84cc16',
    subs: {
      filosofia:   'Filosofía',
      historia:    'Historia y arqueología',
      humanidades: 'Humanidades',
      idiomas:     'Idiomas',
      literatura:  'Literatura',
    },
  },
  hobbies: {
    label: 'Hobbies e Intereses', color: '#f97316',
    subs: {
      arte:          'Artes y manualidades',
      bricolaje:     'Bricolaje y reparaciones',
      coleccionismo: 'Coleccionismo',
      fotografia:    'Fotografía y video',
      jardin:        'Jardinería',
      juegos_mesa:   'Juegos de mesa',
      lego:          'LEGO y construcción',
      musica_inst:   'Música (instrumento)',
    },
  },
  lifestyle: {
    label: 'Estilo de Vida', color: '#ec4899',
    subs: {
      cocina:   'Cocina y gastronomía',
      mascotas: 'Mascotas y animales',
      moda:     'Moda y belleza',
      salud:    'Salud y bienestar',
      viajes:   'Viajes y aventura',
    },
  },
  negocios: {
    label: 'Negocios y Economía', color: '#eab308',
    subs: {
      emprendimiento: 'Emprendimiento',
      global:         'Negocios globales',
      inversion:      'Inversión y bolsa',
      libertarismo:   'Libertarismo y política económica',
      marketing:      'Marketing y publicidad',
    },
  },
  tech: {
    label: 'Tecnología', color: '#3b82f6',
    subs: {
      ciberseguridad: 'Ciberseguridad',
      gadgets:        'Gadgets y reseñas',
      hardware:       'Hardware y PCs',
      ia:             'IA y machine learning',
      impresion3d:    'Impresión 3D y maker',
      programacion:   'Programación y software',
      smartphones:    'Smartphones',
      videojuegos:    'Videojuegos',
      web:            'Web y diseño',
    },
  },
};

// Flat lookup maps (parent keys + subcategory slugs → label/color)
const CAT_LABELS: Record<string, string> = { uncategorized: 'Sin clasificar' };
const CAT_COLORS: Record<string, string> = { uncategorized: '#6b7280' };
for (const [pk, pd] of Object.entries(TAXONOMY)) {
  CAT_LABELS[pk] = pd.label;
  CAT_COLORS[pk] = pd.color;
  for (const [sk, sl] of Object.entries(pd.subs)) {
    CAT_LABELS[`${pk}/${sk}`] = sl;
    CAT_COLORS[`${pk}/${sk}`] = pd.color;
  }
}

// Generate modal select options (parent → subcategories, both alphabetical)
const parentOptions = Object.entries(TAXONOMY)
  .sort(([, a], [, b]) => a.label.localeCompare(b.label, 'es'))
  .map(([pk, pd]) => `<option value="${pk}">${pd.label}</option>`)
  .join('');

// Pre-render subcategory option groups for each parent (injected into HTML,
// browser-side JS switches which group is visible based on parent selection)
const subOptionsByParent = Object.fromEntries(
  Object.entries(TAXONOMY).map(([pk, pd]) => [
    pk,
    Object.entries(pd.subs)
      .sort(([, a], [, b]) => a.localeCompare(b, 'es'))
      .map(([sk, sl]) => `<option value="${pk}/${sk}">${sl}</option>`)
      .join(''),
  ])
);

function fmtNum(n: number): string {
  return n.toLocaleString('es-AR');
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function main() {
  const channels: Channel[] = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf-8'));
  const now = new Date();

  // ── Core stats ──────────────────────────────────────────────────────────
  const watched = channels.filter(c => c.watchCount > 0);
  const totalViews = channels.reduce((s, c) => s + c.watchCount, 0);
  const uniqueChannels = watched.length;
  const subscribed = channels.filter(c => c.isSubscribed);
  const zombies = subscribed.filter(c =>
    c.watchCount === 0 ||
    (c.lastWatched && new Date(c.lastWatched).getTime() < now.getTime() - NINETY_DAYS_MS)
  );

  // ── Load events + durations + live data ─────────────────────────────────────
  const EVENTS_JSON    = 'output/events.json';
  const DURATIONS_JSON = 'output/video-durations.json';
  const LIVE_JSON      = 'output/video-live.json';
  const eventsData: Record<string, [string, string, string][]> =
    fs.existsSync(EVENTS_JSON) ? JSON.parse(fs.readFileSync(EVENTS_JSON, 'utf-8')) : {};
  const durData: Record<string, number | null> =
    fs.existsSync(DURATIONS_JSON) ? JSON.parse(fs.readFileSync(DURATIONS_JSON, 'utf-8')) : {};
  const liveData: Record<string, boolean> =
    fs.existsSync(LIVE_JSON) ? JSON.parse(fs.readFileSync(LIVE_JSON, 'utf-8')) : {};
  const hasDurData  = Object.keys(durData).length > 0;
  const hasLiveData = Object.keys(liveData).length > 0;

  function extractVidId(url: string): string | null {
    return url.match(/[?&]v=([\w-]{11})/)?.[1] ?? null;
  }

  // Format based on avg duration of ALL watched videos (live or not — doesn't matter).
  // ≤180s → shorts-first, >480s → long-form, between → mixed.
  function channelEffectiveFormat(channelId: string, defaultFormat: string): string {
    const evts = eventsData[channelId];
    if (!hasDurData || !evts?.length) return defaultFormat;
    let sumSec = 0, count = 0;
    for (const [, url] of evts) {
      const v = extractVidId(url);
      if (!v || !(v in durData) || durData[v] === null) continue;
      sumSec += durData[v]!;
      count++;
    }
    if (count === 0) return defaultFormat;
    const avg = sumSec / count;
    if (avg <= 180) return 'shorts-first';
    if (avg > 480) return 'long-form';
    return 'mixed';
  }

  // Sum of real durations — deleted/private skipped. Returns { total, live, video }.
  function channelRealSumSec(channelId: string): number {
    const evts = eventsData[channelId];
    if (!hasDurData || !evts?.length) return 0;
    let sum = 0;
    for (const [, url] of evts) {
      const v = extractVidId(url);
      if (v && v in durData && durData[v] !== null) sum += durData[v]!;
    }
    return sum;
  }

  // ── Real watch time ───────────────────────────────────────────────────────
  // Direct sum of known video durations across all events. Lower bound — only
  // counts videos still online and within the 60-event window per channel.
  let totalRealSeconds = 0;
  for (const c of channels) {
    totalRealSeconds += channelRealSumSec(c.channelId);
  }
  const realHours = Math.round(totalRealSeconds / 3600);
  const realDays  = Math.round(realHours / 24);

  // ── Date range ───────────────────────────────────────────────────────────
  const allDates = channels
    .filter(c => c.firstWatched)
    .map(c => new Date(c.firstWatched!));
  const minDate = allDates.length
    ? new Date(Math.min(...allDates.map(d => d.getTime())))
    : null;
  const maxDate = channels
    .filter(c => c.lastWatched)
    .map(c => new Date(c.lastWatched!))
    .reduce((a, b) => (a > b ? a : b), new Date(0));
  const dataDays = minDate ? daysBetween(minDate, maxDate) : 0;

  // ── Category breakdown — grouped by parent for chart/stats ─────────────────
  const parentViews: Record<string, number> = {};
  for (const c of channels) {
    const cat = c.categoryPrimary ?? 'uncategorized';
    const parent = cat.includes('/') ? cat.split('/')[0] : cat;
    parentViews[parent] = (parentViews[parent] ?? 0) + c.watchCount;
  }

  const classifiedViews = Object.entries(parentViews)
    .filter(([k]) => k !== 'uncategorized')
    .sort((a, b) => b[1] - a[1]);
  const classifiedTotal = classifiedViews.reduce((s, [, v]) => s + v, 0);

  const topCat = classifiedViews[0];
  const topCatPct = topCat ? Math.round((topCat[1] / totalViews) * 100) : 0;

  // ── Interactive channel data ──────────────────────────────────────────────
  // Only embed channels watched >= 1 time, sorted by views desc
  const allWatched = watched.sort((a, b) => b.watchCount - a.watchCount);
  const maxWatchCount = allWatched[0]?.watchCount ?? 1;

  // Compact format: [name, url, category, views, isSubscribed, lastWatched, avgDurationSec, format, channelId, realSumSec]
  // realSumSec (index 9): direct sum of real watched-video durations (no averages, deleted skipped)
  const channelsJson = JSON.stringify(
    allWatched.map(c => [
      c.channelName,
      c.channelUrl ?? '',
      c.categoryPrimary ?? 'uncategorized',
      c.watchCount,
      c.isSubscribed ? 1 : 0,
      c.lastWatched ?? '',
      c.avgDurationSeconds ?? 0,
      channelEffectiveFormat(c.channelId, c.format ?? 'unknown'),
      c.channelId,
      channelRealSumSec(c.channelId),
    ])
  );

  // Categories present in data (for filter chips)
  const catsInData = classifiedViews.map(([k]) => k);

  // ── Companion JS files — written from pre-parsed data ───────────────────
  const EVENTS_JS    = 'output/events.js';
  const DURATIONS_JS = 'output/durations.js';
  const LIVE_JS      = 'output/live.js';

  const hasEvents = Object.keys(eventsData).length > 0;
  if (hasEvents) {
    fs.writeFileSync(EVENTS_JS, `window.WATCH_EVENTS=${JSON.stringify(eventsData)};`);
    const evtCount = Object.values(eventsData).reduce((s, v) => s + v.length, 0);
    console.log(`Events data written → ${EVENTS_JS} (${evtCount.toLocaleString('es-AR')} eventos)`);
  }

  const hasDurations = hasDurData;
  if (hasDurations) {
    fs.writeFileSync(DURATIONS_JS, `window.WATCH_DURATIONS=${JSON.stringify(durData)};`);
    console.log(`Durations data written → ${DURATIONS_JS} (${Object.keys(durData).length.toLocaleString('es-AR')} IDs)`);
  }

  if (hasLiveData) {
    fs.writeFileSync(LIVE_JS, `window.WATCH_LIVE=${JSON.stringify(liveData)};`);
    const liveCount = Object.values(liveData).filter(Boolean).length;
    console.log(`Live data written → ${LIVE_JS} (${liveCount.toLocaleString('es-AR')} vivos de ${Object.keys(liveData).length.toLocaleString('es-AR')} IDs)`);
  }

  // ── Zombie sample ─────────────────────────────────────────────────────────
  const zombieNeverWatched = zombies.filter(c => c.watchCount === 0).slice(0, 60);

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartLabels = JSON.stringify(classifiedViews.map(([k]) => CAT_LABELS[k] ?? k));
  const chartData   = JSON.stringify(classifiedViews.map(([, v]) => v));
  const chartColors = JSON.stringify(classifiedViews.map(([k]) => CAT_COLORS[k] ?? '#888'));

  // ── HTML ──────────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Mi YouTube Real</title>
<script>${fs.readFileSync('node_modules/chart.js/dist/chart.umd.min.js', 'utf-8')}</script>
${hasEvents ? '<script src="events.js"></script>' : ''}
${hasDurations ? '<script src="durations.js"></script>' : ''}
${hasLiveData ? '<script src="live.js"></script>' : ''}
<style>
  :root {
    --bg: #0b1120;
    --card: #131d30;
    --card2: #1a2540;
    --border: #1e3058;
    --text: #e2e8f0;
    --muted: #64748b;
    --accent: #6366f1;
    --accent2: #8b5cf6;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    min-height: 100vh;
    padding: 0 0 80px;
  }

  /* ── Hero ── */
  .hero {
    background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
    border-bottom: 1px solid var(--border);
    padding: 60px 24px 48px;
    text-align: center;
  }
  .hero-badge {
    display: inline-block;
    background: rgba(99,102,241,.15);
    border: 1px solid rgba(99,102,241,.35);
    color: #a5b4fc;
    border-radius: 99px;
    padding: 5px 16px;
    font-size: 13px;
    letter-spacing: .04em;
    margin-bottom: 20px;
  }
  .hero h1 {
    font-size: clamp(2rem, 5vw, 3.5rem);
    font-weight: 800;
    background: linear-gradient(90deg, #818cf8, #c084fc, #f472b6);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 12px;
  }
  .hero p {
    color: var(--muted);
    font-size: 15px;
    max-width: 480px;
    margin: 0 auto;
  }

  /* ── Layout ── */
  .container { max-width: 1000px; margin: 0 auto; padding: 0 24px; }
  .section { margin-top: 48px; }
  .section-title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .section-title::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  /* ── Stat cards ── */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    margin-top: 40px;
  }
  .stat-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 24px 20px;
    text-align: center;
    transition: transform .2s;
  }
  .stat-card:hover { transform: translateY(-2px); }
  .stat-number {
    font-size: 2.2rem;
    font-weight: 800;
    background: linear-gradient(135deg, #818cf8, #c084fc);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 1.1;
  }
  .stat-label {
    font-size: 12px;
    color: var(--muted);
    margin-top: 6px;
    line-height: 1.4;
  }
  .stat-sub {
    font-size: 11px;
    color: #374151;
    margin-top: 4px;
  }

  /* ── Alert ── */
  .alert {
    margin-top: 24px;
    background: rgba(239,68,68,.08);
    border: 1px solid rgba(239,68,68,.25);
    border-radius: 12px;
    padding: 16px 20px;
    font-size: 14px;
    color: #fca5a5;
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .alert .icon { font-size: 20px; flex-shrink: 0; }

  /* ── Chart section ── */
  .chart-wrap {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    align-items: center;
  }
  @media (max-width: 600px) { .chart-wrap { grid-template-columns: 1fr; } }
  .chart-canvas-wrap {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 32px;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .legend { display: flex; flex-direction: column; gap: 10px; }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }
  .legend-dot {
    width: 10px; height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .legend-name { flex: 1; color: var(--text); }
  .legend-pct {
    font-weight: 700;
    color: var(--text);
    font-size: 13px;
    min-width: 38px;
    text-align: right;
  }
  .legend-bar-wrap { flex: 1; background: var(--border); border-radius: 99px; height: 4px; }
  .legend-bar { height: 4px; border-radius: 99px; }

  /* ── Controls bar ── */
  .controls-bar {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-bottom: 16px;
  }
  .controls-top {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
  }
  .slider-group {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 220px;
  }
  .slider-label {
    font-size: 13px;
    color: var(--muted);
    white-space: nowrap;
    min-width: 130px;
  }
  .slider-label strong {
    color: #a5b4fc;
    font-variant-numeric: tabular-nums;
  }
  input[type=range].slider {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    background: var(--border);
    border-radius: 99px;
    outline: none;
    cursor: pointer;
  }
  input[type=range].slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    background: var(--accent);
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 0 0 3px rgba(99,102,241,.25);
    transition: box-shadow .15s;
  }
  input[type=range].slider::-webkit-slider-thumb:hover {
    box-shadow: 0 0 0 5px rgba(99,102,241,.35);
  }
  .search-input {
    background: var(--card2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 8px 14px;
    color: var(--text);
    font-size: 13px;
    outline: none;
    width: 200px;
    transition: border-color .15s;
  }
  .search-input::placeholder { color: var(--muted); }
  .search-input:focus { border-color: var(--accent); }
  .sort-chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
  }
  .sort-label {
    font-size: 11px;
    color: var(--muted);
    font-weight: 600;
    letter-spacing: .05em;
    text-transform: uppercase;
    margin-right: 2px;
  }
  .sort-chip {
    background: var(--card2);
    border: 1px solid var(--border);
    border-radius: 99px;
    padding: 5px 14px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all .15s;
    white-space: nowrap;
  }
  .sort-chip:hover { border-color: #4f6080; color: var(--text); }
  .sort-chip.active {
    background: rgba(99,102,241,.15);
    border-color: rgba(99,102,241,.5);
    color: #a5b4fc;
    font-weight: 600;
  }
  .cat-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .cat-btn {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 99px;
    padding: 4px 12px;
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    cursor: pointer;
    letter-spacing: .03em;
    transition: all .15s;
  }
  .cat-btn:hover { border-color: var(--accent); color: var(--text); }
  .cat-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; }
  .format-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding-top: 4px;
    border-top: 1px solid var(--border);
  }
  .fmt-btn {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 99px;
    padding: 4px 12px;
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    cursor: pointer;
    letter-spacing: .03em;
    transition: all .15s;
  }
  .fmt-btn:hover { color: var(--text); }
  .fmt-btn[data-fmt="shorts-first"] { border-color: #fbbf2444; }
  .fmt-btn[data-fmt="shorts-first"]:hover,
  .fmt-btn[data-fmt="shorts-first"].active { background: #fbbf2422; border-color: #fbbf24; color: #fbbf24; }
  .fmt-btn[data-fmt="long-form"] { border-color: #60a5fa44; }
  .fmt-btn[data-fmt="long-form"]:hover,
  .fmt-btn[data-fmt="long-form"].active { background: #60a5fa22; border-color: #60a5fa; color: #60a5fa; }
  .fmt-btn[data-fmt="mixed"] { border-color: #c084fc44; }
  .fmt-btn[data-fmt="mixed"]:hover,
  .fmt-btn[data-fmt="mixed"].active { background: #c084fc22; border-color: #c084fc; color: #c084fc; }
  .fmt-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 99px;
    letter-spacing: .03em;
  }
  .fmt-shorts  { background: #fbbf2415; color: #fbbf24; border: 1px solid #fbbf2433; }
  .fmt-long    { background: #60a5fa15; color: #60a5fa; border: 1px solid #60a5fa33; }
  .fmt-mixed   { background: #c084fc15; color: #c084fc; border: 1px solid #c084fc33; }
  .fmt-live    { background: #f4715015; color: #f47150; border: 1px solid #f4715033; }

  /* ── Result info ── */
  .result-info {
    font-size: 12px;
    color: var(--muted);
    padding: 2px 0 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }
  .result-info strong { color: var(--text); }
  .result-info .total-views-filtered {
    font-size: 11px;
    color: #374151;
  }

  /* ── Channel list ── */
  .channel-list { display: flex; flex-direction: column; gap: 8px; }
  .channel-row {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 12px 16px;
    display: grid;
    grid-template-columns: 32px 1fr auto;
    align-items: start;
    gap: 12px;
    text-decoration: none;
    color: inherit;
    transition: background .15s, border-color .15s;
  }
  .channel-row:hover {
    background: var(--card2);
    border-color: var(--accent);
  }
  .rank {
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
    text-align: center;
    padding-top: 2px;
  }
  .rank.top { color: #fbbf24; }
  .channel-info { min-width: 0; }
  .channel-name {
    font-weight: 600;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .channel-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 5px;
  }
  .cat-chip {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 99px;
    letter-spacing: .03em;
  }
  .sub-badge {
    font-size: 10px;
    color: #34d399;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 99px;
    border: 1px solid rgba(52,211,153,.3);
    background: rgba(52,211,153,.08);
  }
  .channel-detail {
    font-size: 10px;
    color: var(--muted);
    margin-top: 6px;
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  .detail-item { display: flex; align-items: center; gap: 4px; }
  .channel-bar-wrap {
    background: var(--border);
    border-radius: 99px;
    height: 2px;
    width: 100%;
    margin-top: 8px;
  }
  .channel-bar { height: 2px; border-radius: 99px; }
  .watch-count {
    text-align: right;
    min-width: 72px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
    flex-shrink: 0;
  }
  .watch-num {
    font-size: 18px;
    font-weight: 800;
    background: linear-gradient(135deg, #818cf8, #c084fc);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 1.1;
  }
  .watch-hours {
    font-size: 18px;
    font-weight: 800;
    background: linear-gradient(135deg, #2dd4bf, #60a5fa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 1.1;
  }
  .watch-label { font-size: 10px; color: var(--muted); margin-top: 1px; }
  .watch-views-secondary {
    font-size: 10px;
    color: #475569;
    font-weight: 500;
    margin-top: 2px;
  }

  /* ── No results ── */
  .no-results {
    text-align: center;
    padding: 48px 24px;
    color: var(--muted);
    font-size: 14px;
  }
  .more-results {
    text-align: center;
    padding: 16px;
    font-size: 12px;
    color: var(--muted);
    font-style: italic;
  }

  /* ── Zombies ── */
  .zombie-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .zombie-chip {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 99px;
    padding: 5px 14px;
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
  }
  .zombie-more {
    font-size: 12px;
    color: var(--muted);
    padding: 5px 0;
    font-style: italic;
  }

  /* ── Footer ── */
  .footer {
    margin-top: 64px;
    text-align: center;
    font-size: 12px;
    color: #334155;
  }

  /* ── Modal ── */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.6);
    z-index: 200;
    opacity: 0;
    pointer-events: none;
    transition: opacity .25s;
  }
  .modal-overlay.open {
    opacity: 1;
    pointer-events: all;
  }
  .modal-panel {
    position: fixed;
    right: 0; top: 0; bottom: 0;
    width: min(520px, 100vw);
    background: #0f1a2e;
    border-left: 1px solid var(--border);
    z-index: 201;
    transform: translateX(100%);
    transition: transform .3s cubic-bezier(.4,0,.2,1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .modal-overlay.open .modal-panel {
    transform: translateX(0);
  }
  .modal-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 20px 20px 16px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .modal-title-block { flex: 1; min-width: 0; }
  .modal-channel-name {
    font-size: 16px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 6px;
  }
  .modal-badges { display: flex; flex-wrap: wrap; gap: 6px; }
  .modal-close {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--muted);
    font-size: 20px;
    width: 32px;
    height: 32px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all .15s;
  }
  .modal-close:hover { background: var(--card2); color: var(--text); }
  .modal-stats {
    padding: 14px 20px;
    display: flex;
    gap: 20px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .modal-stat { text-align: center; }
  .modal-stat-num {
    font-size: 22px;
    font-weight: 800;
    background: linear-gradient(135deg, #818cf8, #c084fc);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .modal-stat-label { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .modal-data-note {
    padding: 10px 20px;
    font-size: 11px;
    color: #475569;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    line-height: 1.5;
  }
  .modal-videos {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }
  .video-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 20px;
    border-bottom: 1px solid #0d1830;
    transition: background .1s;
  }
  .video-row:hover { background: #131d30; }
  .video-info { flex: 1; min-width: 0; }
  .video-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
    white-space: normal;
    line-height: 1.4;
    text-decoration: none;
    display: block;
  }
  .video-title:hover { color: #818cf8; text-decoration: underline; }
  .video-date { font-size: 11px; color: var(--muted); margin-top: 3px; }
  .video-link {
    color: var(--muted);
    font-size: 14px;
    text-decoration: none;
    flex-shrink: 0;
    padding: 2px 4px;
    transition: color .15s;
  }
  .video-link:hover { color: #818cf8; }
  .video-dur {
    font-size: 10px;
    color: #2dd4bf;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
    padding: 2px 4px;
    align-self: center;
  }
  .video-title-deleted { color: #475569; font-style: italic; }
  .modal-math-note {
    padding: 10px 20px;
    font-size: 11px;
    color: #2dd4bf;
    background: rgba(45,212,191,.07);
    border-bottom: 1px solid rgba(45,212,191,.15);
    flex-shrink: 0;
    font-family: 'SF Mono', 'Consolas', monospace;
    letter-spacing: .01em;
    line-height: 1.6;
  }
  .modal-resize-handle {
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 8px;
    cursor: ew-resize;
    z-index: 10;
    border-radius: 4px 0 0 4px;
    transition: background .15s;
  }
  .modal-resize-handle:hover, .modal-resize-handle.dragging {
    background: rgba(99,102,241,.35);
  }
  .modal-classify {
    padding: 12px 20px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    display: none;
  }
  .modal-classify.visible { display: block; }
  .classify-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 8px;
  }
  .classify-row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .classify-select {
    flex: 1;
    min-width: 120px;
    background: var(--card2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 7px 10px;
    color: var(--text);
    font-size: 12px;
    outline: none;
    cursor: pointer;
  }
  .classify-select:focus { border-color: var(--accent); }
  /* ── Combobox (searchable select) ── */
  .cb-wrap {
    position: relative;
    flex: 1;
    min-width: 140px;
  }
  .cb-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--card2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 7px 28px 7px 10px;
    color: var(--text);
    font-size: 12px;
    outline: none;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cb-input:focus { border-color: var(--accent); }
  .cb-input::placeholder { color: var(--muted); }
  .cb-arrow {
    position: absolute;
    right: 9px; top: 50%;
    transform: translateY(-50%);
    color: var(--muted);
    font-size: 10px;
    pointer-events: none;
  }
  .cb-dropdown {
    display: none;
    position: absolute;
    top: calc(100% + 4px);
    left: 0; right: 0;
    z-index: 9999;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px #0006;
    overflow: hidden;
  }
  .cb-dropdown.open { display: block; }
  .cb-search {
    width: 100%;
    box-sizing: border-box;
    background: var(--card2);
    border: none;
    border-bottom: 1px solid var(--border);
    padding: 8px 10px;
    color: var(--text);
    font-size: 12px;
    outline: none;
  }
  .cb-list {
    max-height: 200px;
    overflow-y: auto;
  }
  .cb-option {
    padding: 8px 12px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cb-option:hover  { background: var(--border); }
  .cb-option.sel    { color: var(--accent); font-weight: 600; }
  .cb-option.hidden { display: none; }
  .cb-empty {
    padding: 10px 12px;
    font-size: 11px;
    color: var(--muted);
    text-align: center;
  }
  .classify-notes {
    width: 100%;
    margin-top: 6px;
    background: var(--card2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 7px 10px;
    color: var(--text);
    font-size: 12px;
    outline: none;
    resize: none;
    font-family: inherit;
  }
  .classify-notes:focus { border-color: var(--accent); }
  .classify-save {
    padding: 7px 18px;
    background: rgba(99,102,241,.15);
    border: 1px solid rgba(99,102,241,.4);
    border-radius: 8px;
    color: #a5b4fc;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all .15s;
    white-space: nowrap;
  }
  .classify-save:hover { background: rgba(99,102,241,.3); }
  .classify-save.saving { opacity: .5; pointer-events: none; }
  .classify-status {
    font-size: 11px;
    margin-top: 6px;
    min-height: 14px;
    color: #2dd4bf;
  }
  .classify-overridden {
    font-size: 10px;
    color: #fbbf24;
    background: rgba(251,191,36,.1);
    border: 1px solid rgba(251,191,36,.2);
    border-radius: 99px;
    padding: 2px 8px;
    display: inline-block;
    margin-left: 6px;
  }
  .modal-footer {
    padding: 14px 20px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }
  .modal-yt-btn {
    display: block;
    width: 100%;
    padding: 10px;
    background: rgba(99,102,241,.1);
    border: 1px solid rgba(99,102,241,.3);
    border-radius: 10px;
    color: #a5b4fc;
    text-align: center;
    text-decoration: none;
    font-size: 13px;
    font-weight: 600;
    transition: all .15s;
  }
  .modal-yt-btn:hover { background: rgba(99,102,241,.2); border-color: var(--accent); }
  .channel-row { cursor: pointer; }
</style>
</head>
<body>

<div class="hero">
  <div class="hero-badge">📊 Análisis personal</div>
  <h1>Mi YouTube Real</h1>
  <p>Lo que YouTube sabe de mí — sin el algoritmo, con datos reales de ${dataDays} días.</p>
</div>

<div class="container">

  <!-- Stats -->
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-number">${fmtNum(totalViews)}</div>
      <div class="stat-label">videos vistos</div>
      <div class="stat-sub">desde ${minDate ? fmtDate(minDate.toISOString()) : '—'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${fmtNum(uniqueChannels)}</div>
      <div class="stat-label">canales únicos</div>
      <div class="stat-sub">distintos entre sí</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">≥${fmtNum(realHours)}h</div>
      <div class="stat-label">horas de video reales</div>
      <div class="stat-sub">≥ ${realDays} días · solo disponibles</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${fmtNum(zombies.length)}</div>
      <div class="stat-label">suscripciones zombie</div>
      <div class="stat-sub">de ${fmtNum(subscribed.length)} totales</div>
    </div>
  </div>

  ${topCatPct > 30 ? `
  <div class="alert">
    <span class="icon">⚠️</span>
    <span><strong>Posible burbuja de contenido:</strong>
    ${topCatPct}% de tu consumo clasificado es <em>${CAT_LABELS[topCat[0]] ?? topCat[0]}</em>.
    El algoritmo te muestra lo que ya sabés que te gusta — estos datos te dicen exactamente cuánto.</span>
  </div>` : ''}

  <!-- Category breakdown -->
  <div class="section">
    <div class="section-title">¿Qué ves realmente?</div>
    <div class="chart-wrap">
      <div class="chart-canvas-wrap">
        <canvas id="catChart"></canvas>
      </div>
      <div class="legend" id="catLegend">
        ${classifiedViews.map(([k, v]) => {
          const pct = Math.round((v / classifiedTotal) * 100);
          const color = CAT_COLORS[k] ?? '#888';
          return `
        <div class="legend-item">
          <div class="legend-dot" style="background:${color}"></div>
          <div class="legend-name">${CAT_LABELS[k] ?? k}</div>
          <div class="legend-bar-wrap"><div class="legend-bar" style="width:${pct}%;background:${color}"></div></div>
          <div class="legend-pct">${pct}%</div>
        </div>`;
        }).join('')}
        <div style="margin-top:8px;font-size:11px;color:var(--muted)">
          (sobre ${fmtNum(classifiedTotal)} vistas clasificadas)
        </div>
      </div>
    </div>
  </div>

  <!-- Interactive channel explorer -->
  <div class="section">
    <div class="section-title">Explorador de canales</div>

    <div class="controls-bar">
      <div class="controls-top">
        <div class="slider-group">
          <span class="slider-label">Mínimo <strong id="nVal">${DEFAULT_N}</strong> vistas</span>
          <input type="range" id="nSlider" class="slider" min="1" max="${maxWatchCount}" value="${DEFAULT_N}" />
        </div>
        <input type="text" id="searchInput" class="search-input" placeholder="🔍 Buscar canal..." />
      </div>
      <div class="sort-chips" id="sortChips">
        <span class="sort-label">Ordenar:</span>
        <button class="sort-chip active" data-sort="hours_desc">⏱ Más horas</button>
        <button class="sort-chip" data-sort="views_desc">↓ Más vistos</button>
        <button class="sort-chip" data-sort="last_desc">🕐 Recientes</button>
        <button class="sort-chip" data-sort="name_asc">A → Z</button>
        <button class="sort-chip" data-sort="cat">Categoría</button>
        <button class="sort-chip" data-sort="format">Formato</button>
      </div>
      <div class="cat-filters" id="catFilters">
        <button class="cat-btn active" data-cat="">Todos</button>
      </div>
      <div class="format-filters" id="formatFilters">
        <button class="fmt-btn active" data-fmt="">⬜ Todos los formatos</button>
        <button class="fmt-btn" data-fmt="shorts-first">⚡ Shorts</button>
        <button class="fmt-btn" data-fmt="long-form">▶ Videos largos</button>
        <button class="fmt-btn" data-fmt="mixed">⊕ Mixto</button>
      </div>
    </div>

    <div class="result-info" id="resultInfo">
      <span><strong id="resultCount">—</strong> canales</span>
      <span class="total-views-filtered" id="resultViews"></span>
    </div>

    <div class="channel-list" id="channelList"></div>
  </div>

  <!-- Zombie subscriptions -->
  <div class="section">
    <div class="section-title">Suscripciones zombie — nunca vistas</div>
    <div class="zombie-grid">
      ${zombieNeverWatched.map(c => `<div class="zombie-chip">${c.channelName}</div>`).join('')}
      ${zombies.length > zombieNeverWatched.length
        ? `<div class="zombie-more">...y ${fmtNum(zombies.length - zombieNeverWatched.length)} más</div>`
        : ''}
    </div>
  </div>

</div>

<!-- Modal -->
<div class="modal-overlay" id="modal" onclick="handleOverlayClick(event)">
  <div class="modal-panel" id="modalPanel">
    <div class="modal-resize-handle" id="modalResizeHandle"></div>
    <div class="modal-header">
      <div class="modal-title-block">
        <div class="modal-channel-name" id="modalName"></div>
        <div class="modal-badges" id="modalBadges"></div>
      </div>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-stats" id="modalStats"></div>
    <div class="modal-data-note">
      📋 Datos del historial de Google Takeout: cuántas veces abriste cada video y cuándo.
      El tiempo real visto no está disponible en la exportación de Google.
    </div>
    <div class="modal-math-note" id="modalMathNote" style="display:none"></div>
    <div class="modal-videos" id="modalVideos"></div>
    <div class="modal-classify" id="modalClassify">
      <div class="classify-title">Reclasificar canal <span id="classifyOverrideBadge"></span></div>
      <div class="classify-row">
        <div class="cb-wrap" id="cbParentWrap">
          <input class="cb-input" id="cbParentInput" placeholder="Categoría..." readonly>
          <span class="cb-arrow">▾</span>
          <div class="cb-dropdown" id="cbParentDrop">
            <input class="cb-search" id="cbParentSearch" placeholder="Buscar categoría...">
            <div class="cb-list" id="cbParentList"></div>
          </div>
        </div>
        <div class="cb-wrap" id="cbSubWrap">
          <input class="cb-input" id="cbSubInput" placeholder="Subcategoría..." readonly>
          <span class="cb-arrow">▾</span>
          <div class="cb-dropdown" id="cbSubDrop">
            <input class="cb-search" id="cbSubSearch" placeholder="Buscar subcategoría...">
            <div class="cb-list" id="cbSubList"></div>
          </div>
        </div>
        <button class="classify-save" id="classifySave" onclick="saveClassification()">Guardar</button>
      </div>
      <div class="classify-row" style="margin-top:6px">
        <div class="cb-wrap" id="cbSecWrap" style="min-width:200px">
          <input class="cb-input" id="cbSecInput" placeholder="También relacionado con (opcional)..." readonly>
          <span class="cb-arrow">▾</span>
          <div class="cb-dropdown" id="cbSecDrop">
            <input class="cb-search" id="cbSecSearch" placeholder="Buscar...">
            <div class="cb-list" id="cbSecList"></div>
          </div>
        </div>
      </div>
      <textarea class="classify-notes" id="classifyNotes" rows="2" placeholder="Notas opcionales..."></textarea>
      <div class="classify-status" id="classifyStatus"></div>
    </div>
    <div class="modal-footer" id="modalFooter"></div>
  </div>
</div>

<div class="footer">
  Generado el ${new Date().toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' })} · youtube-mirror
</div>

<script>
const TAXONOMY = ${JSON.stringify(TAXONOMY)};
const SUB_OPTIONS = ${JSON.stringify(subOptionsByParent)};
// Derive flat maps from TAXONOMY (single source of truth)
const CAT_LABELS = { uncategorized: 'Sin clasificar' };
const CAT_COLORS = { uncategorized: '#6b7280' };
for (const [pk, pd] of Object.entries(TAXONOMY)) {
  CAT_LABELS[pk] = pd.label;
  CAT_COLORS[pk] = pd.color;
  for (const [sk, sl] of Object.entries(pd.subs)) {
    CAT_LABELS[pk+'/'+sk] = sl;
    CAT_COLORS[pk+'/'+sk] = pd.color;
  }
}
// Compact format: [name, url, category, views, isSubscribed, lastWatched, avgDurationSec, format, channelId, realSumSec]
const ALL_CH = ${channelsJson};
const MAX_VISIBLE = ${MAX_VISIBLE};
// Parent keys ordered by total views (for chart stability)
const ALL_CATS_ORDER = ${JSON.stringify(classifiedViews.map(([k]) => k))};

let activeCat = '';
let catChart; // assigned after DOM is ready
let activeFmt = '';
let minViews = ${DEFAULT_N};
let searchQ = '';

// Build category filter buttons — one per parent, alphabetical, only if data exists
const catFilters = document.getElementById('catFilters');
Object.entries(TAXONOMY)
  .sort(([,a],[,b]) => a.label.localeCompare(b.label, 'es'))
  .forEach(([pk, pd]) => {
    const hasData = ALL_CH.some(ch => {
      const cat = ch[2]; return cat === pk || cat.startsWith(pk + '/');
    });
    if (!hasData) return;
    const btn = document.createElement('button');
    btn.className = 'cat-btn';
    btn.dataset.cat = pk;
    btn.style.cssText = 'border-color:' + pd.color + '33';
    btn.textContent = pd.label;
    catFilters.appendChild(btn);
  });

catFilters.addEventListener('click', e => {
  const btn = e.target.closest('.cat-btn');
  if (!btn) return;
  catFilters.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeCat = btn.dataset.cat || '';
  render();
});

document.getElementById('nSlider').addEventListener('input', e => {
  minViews = parseInt(e.target.value);
  document.getElementById('nVal').textContent = minViews.toLocaleString('es-AR');
  render();
});

document.getElementById('searchInput').addEventListener('input', e => {
  searchQ = e.target.value.toLowerCase().trim();
  render();
});

let activeSort = 'hours_desc';
document.getElementById('sortChips').addEventListener('click', e => {
  const chip = e.target.closest('.sort-chip');
  if (!chip) return;
  document.querySelectorAll('.sort-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  activeSort = chip.dataset.sort;
  render();
});

const formatFilters = document.getElementById('formatFilters');
formatFilters.addEventListener('click', e => {
  const btn = e.target.closest('.fmt-btn');
  if (!btn) return;
  formatFilters.querySelectorAll('.fmt-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeFmt = btn.dataset.fmt || '';
  render();
});

function sortChannels(arr) {
  return [...arr].sort((a, b) => {
    switch (activeSort) {
      case 'views_asc':  return a[3] - b[3];
      case 'hours_desc': return b[9] - a[9];
      case 'last_desc':  return (b[5] || '').localeCompare(a[5] || '');
      case 'name_asc':   return a[0].localeCompare(b[0], 'es');
      case 'cat':        return a[2].localeCompare(b[2]) || b[9] - a[9];
      case 'format':     return a[7].localeCompare(b[7]) || b[9] - a[9];
      default:           return b[3] - a[3]; // views_desc
    }
  });
}

function fmtN(n) { return n.toLocaleString('es-AR'); }

function fmtDuration(sec) {
  if (sec == null || sec < 0) return null;
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return m > 0 ? h + 'h ' + m + 'm' : h + 'h';
  }
  if (sec >= 60) return Math.round(sec / 60) + ' min';
  return Math.round(sec) + 's';
}

function relativeTime(iso) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 7)  return 'hace ' + days + ' días';
  const weeks = Math.floor(days / 7);
  if (days < 30) return 'hace ' + weeks + (weeks === 1 ? ' semana' : ' semanas');
  const months = Math.floor(days / 30);
  if (days < 365) return 'hace ' + months + (months === 1 ? ' mes' : ' meses');
  const years = Math.floor(days / 365);
  return 'hace ' + years + (years === 1 ? ' año' : ' años');
}

function render() {
  const filtered = ALL_CH.filter(ch => {
    if (ch[3] < minViews) return false;
    if (activeCat && ch[2] !== activeCat && !ch[2].startsWith(activeCat + '/')) return false;
    if (activeFmt && ch[7] !== activeFmt) return false;
    if (searchQ && !ch[0].toLowerCase().includes(searchQ)) return false;
    return true;
  });

  const sorted = sortChannels(filtered);
  const shown = sorted.slice(0, MAX_VISIBLE);
  const totalFilteredViews = filtered.reduce((s, ch) => s + ch[3], 0);
  const totalFilteredSec   = filtered.reduce((s, ch) => s + (ch[9] || 0), 0);

  document.getElementById('resultCount').textContent = fmtN(filtered.length);
  document.getElementById('resultViews').textContent =
    filtered.length > 0
      ? fmtN(totalFilteredViews) + ' vistas' +
        (totalFilteredSec > 0 ? ' · ' + fmtDuration(totalFilteredSec) + ' de video' : '')
      : '';

  // Progress bar metric follows the active sort criterion
  const useHoursBar = activeSort === 'hours_desc' || activeSort === 'hours_asc';
  const maxMetric = filtered.length
    ? Math.max(...filtered.map(ch => useHoursBar ? (ch[9] || 0) : ch[3]))
    : 1;
  const list = document.getElementById('channelList');

  if (shown.length === 0) {
    list.innerHTML = '<div class="no-results">Sin resultados para este filtro.</div>';
    return;
  }

  list.innerHTML = shown.map((ch, i) => {
    const [name, url, cat, views, sub, last, avgSec, fmt, cid, realSum] = ch;
    const color = CAT_COLORS[cat] || '#888';
    // Chip shows subcategory label; falls back to parent label
    const label = CAT_LABELS[cat] || (cat.includes('/') ? CAT_LABELS[cat.split('/')[0]] : cat);
    const metric = useHoursBar ? (realSum || 0) : views;
    const pct = maxMetric > 0 ? Math.round((metric / maxMetric) * 100) : 0;
    const isTop = i < 3;
    const lastStr = relativeTime(last);

    const fmtBadge = fmt === 'shorts-first'
      ? '<span class="fmt-badge fmt-shorts">⚡ Shorts</span>'
      : fmt === 'long-form'
      ? '<span class="fmt-badge fmt-long">▶ Largo</span>'
      : fmt === 'mixed'
      ? '<span class="fmt-badge fmt-mixed">⊕ Mixto</span>'
      : '';

    const details = [];
    if (lastStr) details.push(lastStr);

    return \`
    <div class="channel-row" onclick="openModal('\${cid}','\${(url||'').replace(/'/g,'%27')}',\${i})">
      <div class="rank \${isTop ? 'top' : ''}">\${i + 1}</div>
      <div class="channel-info">
        <div class="channel-name">\${name}</div>
        <div class="channel-meta">
          <span class="cat-chip" style="background:\${color}22;color:\${color};border:1px solid \${color}44">\${label}</span>
          \${fmtBadge}
          \${sub ? '<span class="sub-badge">✓ suscripto</span>' : ''}
        </div>
        \${details.length ? \`<div class="channel-detail">\${details.map(d => '<span class="detail-item">' + d + '</span>').join('')}</div>\` : ''}
        <div class="channel-bar-wrap">
          <div class="channel-bar" style="width:\${pct}%;background:\${color}"></div>
        </div>
      </div>
      <div class="watch-count">
        \${realSum > 0
          ? \`<div class="watch-hours">\${fmtDuration(realSum)}</div>
             <div class="watch-label">de video</div>
             <div class="watch-views-secondary">\${fmtN(views)} vistas</div>\`
          : \`<div class="watch-num">\${fmtN(views)}</div>
             <div class="watch-label">vistas</div>\`
        }
      </div>
    </div>\`;
  }).join('');

  if (filtered.length > MAX_VISIBLE) {
    list.insertAdjacentHTML('beforeend',
      '<div class="more-results">Mostrando ' + fmtN(MAX_VISIBLE) + ' de ' + fmtN(filtered.length) + ' canales. Aumentá el filtro de vistas mínimas para acotar.</div>'
    );
  }

  updateChart(filtered);
}

render();

// ── Modal ──────────────────────────────────────────────────────────────────
const modal = document.getElementById('modal');

function handleOverlayClick(e) {
  if (e.target === modal) closeModal();
}
function closeModal() {
  modal.classList.remove('open');
  document.body.style.overflow = '';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ── API / server detection ───────────────────────────────────────────────────
let API_AVAILABLE = false;
let currentModalChannelId = null;

fetch('/api/stats').then(r => {
  if (r.ok) {
    API_AVAILABLE = true;
    console.log('✅ Servidor API disponible — clasificación habilitada');
    // Load overrides and update channel display
    fetch('/api/overrides').then(r => r.json()).then(overrides => {
      window._OVERRIDES = overrides;
      // Apply overrides to ALL_CH so render() reflects them after page refresh
      for (const [channelId, ov] of Object.entries(overrides)) {
        const ch = ALL_CH.find(c => c[8] === channelId);
        if (ch) ch[2] = ov.categoryPrimary;
      }
      if (Object.keys(overrides).length > 0) render();
    });
  }
}).catch(() => {
  console.log('ℹ️  Sin servidor API — modo solo lectura (corré npm run serve)');
});

// ── Combobox component ────────────────────────────────────────────────────────
class Combobox {
  constructor(inputId, searchId, listId, dropId, onChange) {
    this.input    = document.getElementById(inputId);
    this.search   = document.getElementById(searchId);
    this.list     = document.getElementById(listId);
    this.drop     = document.getElementById(dropId);
    this.onChange = onChange;
    this.value    = '';
    this.options  = []; // [{value, label}]

    this.input.addEventListener('click', () => this.open());
    this.search.addEventListener('input', () => this.filter());
    this.search.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.close();
      if (e.key === 'Enter') {
        const vis = this.list.querySelectorAll('.cb-option:not(.hidden)');
        if (vis.length === 1) this.select(vis[0].dataset.value, vis[0].textContent);
      }
    });
    document.addEventListener('click', e => {
      if (!this.input.closest('.cb-wrap').contains(e.target)) this.close();
    });
  }

  setOptions(opts) { // opts: [{value, label}]
    this.options = opts;
    this.renderList();
  }

  renderList() {
    const q = (this.search.value || '').toLowerCase().trim();
    let html = '';
    for (const o of this.options) {
      const hidden = q && !o.label.toLowerCase().includes(q) ? ' hidden' : '';
      const sel    = o.value === this.value ? ' sel' : '';
      html += \`<div class="cb-option\${hidden}\${sel}" data-value="\${o.value}">\${o.label}</div>\`;
    }
    this.list.innerHTML = html || '<div class="cb-empty">Sin resultados</div>';
    this.list.querySelectorAll('.cb-option').forEach(el => {
      el.addEventListener('click', () => this.select(el.dataset.value, el.textContent));
    });
  }

  filter() { this.renderList(); }

  select(val, label) {
    this.value     = val;
    this.input.value = label.trim();
    this.close();
    if (this.onChange) this.onChange(val);
  }

  setValue(val) {
    this.value = val;
    if (!val) { this.input.value = ''; return; }
    const opt = this.options.find(o => o.value === val);
    this.input.value = opt ? opt.label : val;
    this.renderList();
  }

  open() {
    this.drop.classList.add('open');
    this.search.value = '';
    this.renderList();
    this.search.focus();
    // Scroll selected into view
    setTimeout(() => {
      const sel = this.list.querySelector('.cb-option.sel');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }, 0);
  }

  close() { this.drop.classList.remove('open'); }
  getValue() { return this.value; }
}

// Build option arrays from TAXONOMY
const parentOpts = Object.entries(TAXONOMY)
  .sort(([,a],[,b]) => a.label.localeCompare(b.label,'es'))
  .map(([pk, pd]) => ({ value: pk, label: pd.label }));

const allSubOpts = Object.entries(TAXONOMY)
  .sort(([,a],[,b]) => a.label.localeCompare(b.label,'es'))
  .flatMap(([pk, pd]) =>
    Object.entries(pd.subs)
      .sort(([,a],[,b]) => a.localeCompare(b,'es'))
      .map(([sk, sl]) => ({ value: pk+'/'+sk, label: pd.label+' › '+sl }))
  );

function subOptsFor(parentKey) {
  if (!parentKey || !TAXONOMY[parentKey]) return [];
  return Object.entries(TAXONOMY[parentKey].subs)
    .sort(([,a],[,b]) => a.localeCompare(b,'es'))
    .map(([sk, sl]) => ({ value: parentKey+'/'+sk, label: sl }));
}

// ── Classification ───────────────────────────────────────────────────────────
let cbParent, cbSub, cbSec;

function initComboboxes() {
  cbParent = new Combobox('cbParentInput','cbParentSearch','cbParentList','cbParentDrop', pk => {
    cbSub.setOptions(subOptsFor(pk));
    cbSub.setValue('');
  });
  cbSub = new Combobox('cbSubInput','cbSubSearch','cbSubList','cbSubDrop', null);
  cbSec = new Combobox('cbSecInput','cbSecSearch','cbSecList','cbSecDrop', null);

  cbParent.setOptions(parentOpts);
  cbSec.setOptions(allSubOpts);
}

function openClassifyPanel(channelId, currentCat, currentCat2, notes, isOverridden) {
  const panel = document.getElementById('modalClassify');
  if (!API_AVAILABLE) { panel.classList.remove('visible'); return; }
  panel.classList.add('visible');

  if (!cbParent) initComboboxes();

  const parentKey = currentCat ? currentCat.split('/')[0] : '';
  cbParent.setValue(parentKey);
  cbSub.setOptions(subOptsFor(parentKey));
  cbSub.setValue(currentCat || '');
  cbSec.setValue(currentCat2 || '');

  document.getElementById('classifyNotes').value     = notes || '';
  document.getElementById('classifyStatus').textContent = '';
  document.getElementById('classifyOverrideBadge').innerHTML =
    isOverridden ? '<span class="classify-overridden">✏️ editado</span>' : '';
}

async function saveClassification() {
  if (!API_AVAILABLE || !currentModalChannelId) return;
  const primary   = cbSub?.getValue()    || '';
  const secondary = cbSec?.getValue()    || '';
  const notes     = document.getElementById('classifyNotes').value.trim();
  const btn       = document.getElementById('classifySave');
  const status    = document.getElementById('classifyStatus');

  if (!primary) { status.textContent = 'Seleccioná categoría y subcategoría.'; return; }

  btn.classList.add('saving');
  status.textContent = 'Guardando...';

  try {
    const res = await fetch(\`/api/channels/\${currentModalChannelId}\`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryPrimary: primary, categorySecondary: secondary, notes }),
    });
    if (!res.ok) throw new Error('Error ' + res.status);

    const ch = ALL_CH.find(c => c[8] === currentModalChannelId);
    if (ch) {
      ch[2] = primary;
      const color = CAT_COLORS[primary] || '#888';
      const catChip = document.querySelector('.modal-badges .cat-chip');
      if (catChip) {
        catChip.style.cssText = \`background:\${color}22;color:\${color};border:1px solid \${color}44\`;
        catChip.textContent = CAT_LABELS[primary] || primary;
      }
    }
    if (!window._OVERRIDES) window._OVERRIDES = {};
    window._OVERRIDES[currentModalChannelId] = { categoryPrimary: primary, categorySecondary: secondary, notes };

    document.getElementById('classifyOverrideBadge').innerHTML = '<span class="classify-overridden">✏️ editado</span>';
    status.style.color = '#2dd4bf';
    status.textContent = '✓ Guardado en db.json';
    render();
  } catch (e) {
    status.style.color = '#f87171';
    status.textContent = '✗ Error al guardar: ' + e.message;
  } finally {
    btn.classList.remove('saving');
  }
}

// ── Modal resize handle ─────────────────────────────────────────────────────
(function() {
  const handle = document.getElementById('modalResizeHandle');
  const panel  = document.getElementById('modalPanel');
  let dragging = false, startX = 0, startW = 0;
  handle.addEventListener('mousedown', e => {
    dragging = true; startX = e.clientX; startW = panel.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const newW = Math.max(320, Math.min(window.innerWidth - 64, startW + (startX - e.clientX)));
    panel.style.width = newW + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });
})();

function fmtDateShort(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function openModal(cid, chanUrl, rankIdx) {
  const ch = ALL_CH.find(c => c[8] === cid);
  if (!ch) return;
  const [name, url, cat, views, sub, last, avgSec, fmt] = ch;
  const color = CAT_COLORS[cat] || '#888';

  // Header
  document.getElementById('modalName').textContent = name;
  const fmtBadge = fmt === 'shorts-first' ? '<span class="fmt-badge fmt-shorts">⚡ Shorts</span>'
    : fmt === 'live-first' ? '<span class="fmt-badge fmt-live">📡 Vivos</span>'
    : fmt === 'long-form' ? '<span class="fmt-badge fmt-long">▶ Largo</span>'
    : fmt === 'mixed' ? '<span class="fmt-badge fmt-mixed">⊕ Mixto</span>' : '';
  const subBadge = sub ? '<span class="sub-badge">✓ suscripto</span>' : '';
  document.getElementById('modalBadges').innerHTML =
    \`<span class="cat-chip" style="background:\${color}22;color:\${color};border:1px solid \${color}44">\${CAT_LABELS[cat]||cat}</span>\${fmtBadge}\${subBadge}\`;

  // Stats
  const lastStr  = last ? fmtDateShort(last) : '—';
  const realSumS = ch[9] || 0;
  const statHours = realSumS > 0
    ? \`<div class="modal-stat"><div class="modal-stat-num" style="background:linear-gradient(135deg,#2dd4bf,#60a5fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">\${fmtDuration(realSumS)}</div><div class="modal-stat-label">de video real</div></div>\`
    : '';
  document.getElementById('modalStats').innerHTML =
    \`<div class="modal-stat"><div class="modal-stat-num">\${fmtN(views)}</div><div class="modal-stat-label">vistas registradas</div></div>
     \${statHours}
     <div class="modal-stat"><div class="modal-stat-num">#\${rankIdx+1}</div><div class="modal-stat-label">posición</div></div>
     <div class="modal-stat"><div class="modal-stat-num" style="font-size:13px;-webkit-text-fill-color:var(--muted);background:none">\${lastStr}</div><div class="modal-stat-label">última vista</div></div>\`;

  // Videos
  const videosEl = document.getElementById('modalVideos');
  const mathNoteEl = document.getElementById('modalMathNote');
  const evts = (typeof WATCH_EVENTS !== 'undefined' && WATCH_EVENTS[cid]) || null;
  if (evts && evts.length > 0) {
    const extractVid = url => url.match(/[?&]v=([\\w-]{11})/)?.[1] ?? null;
    const hasDur = typeof WATCH_DURATIONS !== 'undefined';

    const hasLive = typeof WATCH_LIVE !== 'undefined';

    // Real duration per event — null if deleted/private/unknown (not counted)
    const vidDurations = evts.map(([, vurl]) => {
      const vid = extractVid(vurl);
      if (hasDur && vid && WATCH_DURATIONS[vid] != null) return WATCH_DURATIONS[vid];
      return null;
    });

    let sumVideoSec = 0, sumLiveSec = 0, videoCount = 0, liveCount = 0;
    evts.forEach(([, vurl], idx) => {
      const d = vidDurations[idx];
      if (d === null) return;
      const v2 = extractVid(vurl);
      if (hasLive && v2 && WATCH_LIVE[v2] === true) { sumLiveSec += d; liveCount++; }
      else { sumVideoSec += d; videoCount++; }
    });
    const realCount  = videoCount + liveCount;
    const sumRealSec = sumVideoSec + sumLiveSec;
    const skipped    = evts.length - realCount;

    if (realCount > 0) {
      const rows = [];
      if (videoCount > 0) rows.push(\`<span>\${videoCount} videos</span><span>\${fmtDuration(sumVideoSec)}</span>\`);
      if (liveCount  > 0) rows.push(\`<span>📡 \${liveCount} vivos</span><span>\${fmtDuration(sumLiveSec)}</span>\`);
      if (skipped    > 0) rows.push(\`<span style="color:#475569">\${skipped} sin datos</span><span style="color:#475569">—</span>\`);
      mathNoteEl.innerHTML =
        \`<div style="display:flex;justify-content:space-between;font-weight:700;margin-bottom:6px;color:#e2e8f0">
           <span>⏱ Tiempo acumulado</span><span>\${fmtDuration(sumRealSec)}</span>
         </div>\` +
        rows.map(r => \`<div style="display:flex;justify-content:space-between;opacity:.75">\${r}</div>\`).join('');
      mathNoteEl.style.display = 'block';
    } else {
      mathNoteEl.style.display = 'none';
    }

    videosEl.innerHTML = evts.map(([title, vurl, date], idx) => {
      const isUrl = !title || title.startsWith('http');
      const displayTitle = isUrl ? '(sin título — video eliminado)' : title;
      const titleClass = isUrl ? 'video-title video-title-deleted' : 'video-title';
      const durSec = vidDurations[idx];
      const vid2   = extractVid(vurl);
      const isLive  = hasLive && vid2 && WATCH_LIVE[vid2] === true;
      const isShort = !isLive && durSec !== null && durSec <= 180;
      const icon    = isLive ? '📡 ' : isShort ? '⚡ ' : '';
      const durStr  = durSec !== null ? icon + fmtDuration(durSec) : null;
      return \`
      <div class="video-row">
        <div class="video-info">
          <a class="\${titleClass}" href="\${vurl}" target="_blank" rel="noopener">\${displayTitle}</a>
          \${date ? \`<div class="video-date">\${fmtDateShort(date)}</div>\` : ''}
        </div>
        \${durStr ? \`<div class="video-dur" title="Duración real (YouTube API)">\${durStr}</div>\` : ''}
        <a class="video-link" href="\${vurl}" target="_blank" rel="noopener" title="Ver en YouTube">↗</a>
      </div>\`;
    }).join('');
  } else if (typeof WATCH_EVENTS === 'undefined') {
    mathNoteEl.style.display = 'none';
    videosEl.innerHTML = '<div style="padding:24px 20px;color:var(--muted);font-size:13px">Para ver el detalle de videos, abrí el reporte con un servidor local:<br><br><code style="background:#131d30;padding:4px 8px;border-radius:6px">npx serve output -p 3000</code></div>';
  } else {
    mathNoteEl.style.display = 'none';
    videosEl.innerHTML = '<div style="padding:24px 20px;color:var(--muted);font-size:13px">Sin detalle de videos disponible para este canal.<br><br>Ejecutá <code style="background:#131d30;padding:4px 8px;border-radius:6px">npm run events</code> para generar el historial.</div>';
  }

  // Footer
  document.getElementById('modalFooter').innerHTML =
    chanUrl ? \`<a class="modal-yt-btn" href="\${chanUrl}" target="_blank" rel="noopener">Ver canal en YouTube ↗</a>\` : '';

  // Classification panel
  currentModalChannelId = cid;
  const ov = window._OVERRIDES?.[cid];
  openClassifyPanel(cid, ov?.categoryPrimary ?? cat, ov?.categorySecondary, ov?.notes, !!ov);

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

// ── Donut chart ────────────────────────────────────────────────────────────
const ctx = document.getElementById('catChart').getContext('2d');
catChart = new Chart(ctx, {
  type: 'doughnut',
  data: {
    labels: ${chartLabels},
    datasets: [{
      data: ${chartData},
      backgroundColor: ${chartColors},
      borderColor: '#0b1120',
      borderWidth: 3,
      hoverOffset: 8,
    }]
  },
  options: {
    cutout: '68%',
    animation: { duration: 300 },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const pct = Math.round(ctx.raw / total * 100);
            return ' ' + ctx.raw.toLocaleString('es-AR') + ' vistas (' + pct + '%)';
          }
        }
      }
    }
  }
});

function updateChart(filteredChannels) {
  if (!catChart) return;
  // Group by parent category for a readable chart (max 9 segments vs 55)
  const parentTotals = {};
  for (const ch of filteredChannels) {
    const cat = ch[2];
    if (cat === 'uncategorized') continue;
    const parent = cat.includes('/') ? cat.split('/')[0] : cat;
    parentTotals[parent] = (parentTotals[parent] || 0) + ch[3];
  }
  // Order: stable (ALL_CATS_ORDER) filtered to what has data
  const ordered = ALL_CATS_ORDER.filter(k => parentTotals[k] > 0);
  // Any parent in data but not in ALL_CATS_ORDER (edge case)
  for (const k of Object.keys(parentTotals)) {
    if (!ordered.includes(k)) ordered.push(k);
  }
  catChart.data.labels      = ordered.map(k => TAXONOMY[k]?.label || CAT_LABELS[k] || k);
  catChart.data.datasets[0].data            = ordered.map(k => parentTotals[k]);
  catChart.data.datasets[0].backgroundColor = ordered.map(k => TAXONOMY[k]?.color || '#888');
  catChart.update();
  // Update legend
  const legendEl = document.getElementById('catLegend');
  if (!legendEl) return;
  const total = ordered.reduce((s, k) => s + parentTotals[k], 0);
  legendEl.innerHTML = ordered.map(k => {
    const pct = Math.round((parentTotals[k] / total) * 100);
    const color = TAXONOMY[k]?.color || '#888';
    return \`<div class="legend-item">
      <div class="legend-dot" style="background:\${color}"></div>
      <div class="legend-name">\${TAXONOMY[k]?.label || k}</div>
      <div class="legend-bar-wrap"><div class="legend-bar" style="width:\${pct}%;background:\${color}"></div></div>
      <div class="legend-pct">\${pct}%</div>
    </div>\`;
  }).join('') + \`<div style="margin-top:8px;font-size:11px;color:var(--muted)">(sobre \${total.toLocaleString('es-AR')} vistas filtradas)</div>\`;
}
</script>
</body>
</html>`;

  fs.writeFileSync(HTML_FILE, html);
  console.log(`Reporte visual generado → ${HTML_FILE}`);
  console.log(`Canales embebidos: ${allWatched.length.toLocaleString('es-AR')}`);
  console.log(`Abrí el archivo en tu navegador para verlo.`);
}

main();
