import 'dotenv/config';
import fs from 'fs';
import type { Channel } from '../types.js';

const CHANNELS_FILE = 'output/channels.json';
const REPORT_FILE = 'output/report.md';
const AUDIT_FILE = 'output/audit.json';

function pct(part: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((part / total) * 100)}%`;
}

function fmt(n: number): string {
  return n.toLocaleString('es-AR');
}

interface CategoryStat {
  watchCount: number;
  channelCount: number;
  channels: string[];
}

async function main() {
  const channels: Channel[] = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf-8'));

  const totalWatches = channels.reduce((s, c) => s + c.watchCount, 0);
  const subscribed = channels.filter(c => c.isSubscribed);
  const watched = channels.filter(c => c.watchCount > 0);

  // --- Category breakdown ---
  const byCategory = new Map<string, CategoryStat>();
  for (const ch of watched) {
    const cat = ch.categoryPrimary ?? 'uncategorized';
    const existing = byCategory.get(cat) ?? { watchCount: 0, channelCount: 0, channels: [] };
    existing.watchCount += ch.watchCount;
    existing.channelCount++;
    existing.channels.push(ch.channelName);
    byCategory.set(cat, existing);
  }

  const categoryRows = [...byCategory.entries()]
    .sort((a, b) => b[1].watchCount - a[1].watchCount)
    .map(([cat, stat]) =>
      `| ${cat} | ${fmt(stat.watchCount)} | ${pct(stat.watchCount, totalWatches)} | ${stat.channelCount} |`
    );

  // --- Format breakdown ---
  const byFormat = new Map<string, { watchCount: number; count: number }>();
  for (const ch of watched) {
    const fmt2 = ch.format ?? 'unknown';
    const e = byFormat.get(fmt2) ?? { watchCount: 0, count: 0 };
    e.watchCount += ch.watchCount;
    e.count++;
    byFormat.set(fmt2, e);
  }

  const formatRows = [...byFormat.entries()]
    .sort((a, b) => b[1].watchCount - a[1].watchCount)
    .map(([f, s]) =>
      `| ${f} | ${fmt(s.watchCount)} | ${pct(s.watchCount, totalWatches)} | ${s.count} |`
    );

  // --- Zombie subscriptions (subscribed but watchCount = 0 or last watched > 90 days ago) ---
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const zombies = subscribed.filter(c =>
    c.watchCount === 0 || (c.lastWatched && c.lastWatched < ninetyDaysAgo)
  ).sort((a, b) => a.watchCount - b.watchCount);

  const zombieRows = zombies.slice(0, 30).map(c =>
    `| ${c.channelName} | ${c.watchCount} | ${c.lastWatched ? c.lastWatched.slice(0, 10) : 'nunca'} | ${c.format ?? '?'} |`
  );

  // --- Top 15 channels by watch count ---
  const topRows = channels
    .filter(c => c.watchCount > 0)
    .slice(0, 15)
    .map((c, i) =>
      `| ${i + 1} | ${c.channelName} | ${fmt(c.watchCount)} | ${pct(c.watchCount, totalWatches)} | ${c.categoryPrimary ?? '?'} | ${c.format ?? '?'} |`
    );

  // --- Echo chamber detection ---
  const topCategory = [...byCategory.entries()].sort((a, b) => b[1].watchCount - a[1].watchCount)[0];
  const echoWarning = topCategory && (topCategory[1].watchCount / totalWatches) > 0.6
    ? `> ⚠️ **Posible cámara de eco:** el ${pct(topCategory[1].watchCount, totalWatches)} de tus vistas es de la categoría \`${topCategory[0]}\`.`
    : `> ✅ Sin cámara de eco detectada — ninguna categoría supera el 60% del consumo.`;

  // --- Build report ---
  const now = new Date().toLocaleDateString('es-AR', { dateStyle: 'long' });
  const report = `# YouTube Mirror — Reporte de consumo
*Generado el ${now}*

## Resumen general

| Métrica | Valor |
|---|---|
| Total de eventos de vista | ${fmt(totalWatches)} |
| Canales únicos vistos | ${fmt(watched.length)} |
| Suscripciones | ${fmt(subscribed.length)} |
| Suscripciones zombies (>90 días sin ver) | ${fmt(zombies.length)} |

${echoWarning}

## Consumo por categoría

| Categoría | Vistas | % | Canales |
|---|---|---|---|
${categoryRows.join('\n')}

## Consumo por formato de video

| Formato | Vistas | % | Canales |
|---|---|---|---|
${formatRows.join('\n')}

## Top 15 canales más vistos

| # | Canal | Vistas | % total | Categoría | Formato |
|---|---|---|---|---|---|
${topRows.join('\n')}

## Suscripciones zombies (primeras 30)

Canales a los que estás suscripto pero no ves hace más de 90 días, o nunca viste.

| Canal | Vistas totales | Última vista | Formato |
|---|---|---|---|
${zombieRows.join('\n')}
`;

  fs.writeFileSync(REPORT_FILE, report);

  // --- Audit JSON ---
  const audit = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalWatches,
      uniqueChannelsWatched: watched.length,
      subscriptions: subscribed.length,
      zombieSubscriptions: zombies.length,
    },
    byCategory: Object.fromEntries(byCategory),
    byFormat: Object.fromEntries(byFormat),
    zombieSubscriptions: zombies,
    topChannels: channels.filter(c => c.watchCount > 0).slice(0, 50),
  };
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(audit, null, 2));

  console.log(`Reporte generado en ${REPORT_FILE}`);
  console.log(`Audit JSON guardado en ${AUDIT_FILE}`);
}

main();
