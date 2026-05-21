/**
 * Fetches real per-video duration from YouTube API for all videos in output/events.json.
 * Writes output/video-durations.json: { [videoId]: durationSeconds | null }
 *
 * LEARNINGS / DECISIONES DE DISEÑO:
 *
 * 1. Por qué no incluir la duración en events.json directamente:
 *    events.json es generado por ingest/build-events.ts desde el Takeout local (sin API).
 *    Mezclar datos locales con datos de API en el mismo archivo rompe la separación de
 *    responsabilidades: ingest lee archivos, enrich llama APIs. Mantener video-durations.json
 *    separado permite re-correr cualquier paso sin invalidar los otros.
 *
 * 2. Por qué null para videos eliminados/privados en lugar de omitirlos:
 *    Si un video no existe en la API no aparece en el response. Sin marcar ese ID como
 *    "ya consultado", cada re-run haría la misma llamada API sin resultado → quota desperdiciada.
 *    null = "consultado, no disponible". Ausencia de clave = "nunca consultado".
 *
 * 3. Quota cost: videos.list?part=contentDetails cuesta 1 unit/call.
 *    ~44k eventos / 50 por batch = ~897 llamadas = 897 units/día.
 *    Límite diario de YouTube Data API v3: 10.000 units. Margen amplio.
 *    En re-runs subsiguientes el costo es 0 (todo ya cacheado).
 *
 * 4. Duración ISO 8601 → segundos:
 *    YouTube devuelve "PT16M48S", "PT1H2M3S", "PT45S", etc.
 *    Shorts (<60s) vienen como "PT58S" — sin componente M ni H.
 *    El parser maneja todos los casos con regex opcionales.
 *
 * 5. Por qué no usar el SDK de googleapis para el tipo de response:
 *    La librería devuelve tipos que dependen de qué `part` pediste.
 *    Es más simple tipar el resultado como `any` y acceder por path conocido
 *    que satisfacer el type system con un part dinámico.
 *
 * Run: npm run enrich:videos
 */

import 'dotenv/config';
import fs from 'fs';
import { google } from 'googleapis';

const EVENTS_FILE    = 'output/events.json';
const DURATIONS_FILE = 'output/video-durations.json';
const BATCH_SIZE     = 50;   // YouTube API hard limit for videos.list
const DELAY_MS       = 60;   // light throttle; quota (not rate) is the real constraint

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

// Parse ISO 8601 duration (PT#H#M#S) → total seconds
// Each component is optional. "PT0S" = 0. "PT1H" = 3600.
function parseDuration(iso: string): number {
  const h = parseInt(iso.match(/(\d+)H/)?.[1] ?? '0', 10);
  const m = parseInt(iso.match(/(\d+)M/)?.[1] ?? '0', 10);
  const s = parseInt(iso.match(/(\d+)S/)?.[1] ?? '0', 10);
  return h * 3600 + m * 60 + s;
}

// Extract YouTube video ID from watch URL (?v=xxx or &v=xxx, always 11 chars)
function extractVideoId(url: string): string | null {
  return url.match(/[?&]v=([\w-]{11})/)?.[1] ?? null;
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  if (!process.env.YOUTUBE_API_KEY) {
    console.error('ERROR: YOUTUBE_API_KEY not set in .env');
    process.exit(1);
  }

  if (!fs.existsSync(EVENTS_FILE)) {
    console.error(`ERROR: ${EVENTS_FILE} not found. Run "npm run events" first.`);
    process.exit(1);
  }

  // ── Load events and collect unique video IDs ──────────────────────────────
  const events: Record<string, [string, string, string][]> =
    JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf-8'));

  const allIds = new Set<string>();
  for (const vids of Object.values(events)) {
    for (const [, url] of vids) {
      const id = extractVideoId(url);
      if (id) allIds.add(id);
    }
  }
  console.log(`Unique video IDs in events.json: ${allIds.size}`);

  // ── Load existing cache (idempotency) ────────────────────────────────────
  // Keys present (even as null) are skipped — "null" means "checked, unavailable"
  const durations: Record<string, number | null> = fs.existsSync(DURATIONS_FILE)
    ? JSON.parse(fs.readFileSync(DURATIONS_FILE, 'utf-8'))
    : {};

  const cachedCount = Object.keys(durations).length;
  if (cachedCount > 0) {
    console.log(`Cache hit: ${cachedCount} IDs already fetched, skipping`);
  }

  const toFetch = [...allIds].filter(id => !(id in durations));
  console.log(`To fetch: ${toFetch.length} new IDs`);

  if (toFetch.length === 0) {
    console.log('Nothing to do — all IDs cached. Regenerate the report to pick up changes.');
    return;
  }

  // ── Fetch durations in batches ───────────────────────────────────────────
  const batches = chunks(toFetch, BATCH_SIZE);
  let fetched = 0, available = 0, unavailable = 0;
  const errors: string[] = [];

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    try {
      const res = await youtube.videos.list({
        part: ['contentDetails'],
        id: batch,
      });

      const returned = new Map<string, number>();
      for (const item of res.data.items ?? []) {
        const sec = parseDuration(item.contentDetails?.duration ?? 'PT0S');
        returned.set(item.id!, sec);
        available++;
      }

      // IDs not in response → deleted or private → store null so we skip them next run
      for (const id of batch) {
        durations[id] = returned.has(id) ? returned.get(id)! : null;
        if (!returned.has(id)) unavailable++;
      }
    } catch (err: any) {
      // On API error, skip the batch (don't mark as null — will retry next run)
      const msg = err?.message ?? String(err);
      errors.push(`Batch ${bi + 1}: ${msg}`);
      console.error(`\n  API error on batch ${bi + 1}: ${msg}`);
    }

    fetched += batch.length;
    process.stdout.write(
      `\r  ${fetched}/${toFetch.length} — ✓ ${available} disponibles, ✗ ${unavailable} eliminados/privados`
    );

    if (DELAY_MS > 0) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  // ── Write results ────────────────────────────────────────────────────────
  console.log('\nEscribiendo video-durations.json...');
  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync(DURATIONS_FILE, JSON.stringify(durations));

  const totalCached = Object.keys(durations).length;
  const nullCount   = Object.values(durations).filter(v => v === null).length;

  console.log(`\nListo.`);
  console.log(`  ${available.toLocaleString()} durations reales obtenidas`);
  console.log(`  ${unavailable.toLocaleString()} videos eliminados/privados (marcados null)`);
  console.log(`  ${totalCached.toLocaleString()} IDs totales en caché → ${DURATIONS_FILE}`);
  if (nullCount > 0) {
    const pct = ((nullCount / totalCached) * 100).toFixed(1);
    console.log(`  ${pct}% del historial apunta a videos ya eliminados — dato interesante per se`);
  }
  if (errors.length > 0) {
    console.warn(`\n  ${errors.length} batches con error (IDs no marcados, se reintentarán al re-correr):`);
    errors.slice(0, 5).forEach(e => console.warn('  ' + e));
  }

  console.log('\nPróximo paso: npm run report:html  (bakeará las duraciones reales al reporte)');
}

main().catch(e => { console.error(e); process.exit(1); });
