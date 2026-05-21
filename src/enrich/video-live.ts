/**
 * Fetches liveStreamingDetails for all known video IDs (from video-durations.json).
 * Writes output/video-live.json: { [videoId]: boolean }
 *
 * true  = confirmed live stream (had actualStartTime)
 * false = confirmed NOT a live stream
 * absent key = never checked (re-runs only fetch unchecked IDs)
 *
 * Quota cost: 1 unit per batch of 50 — same as enrich:videos.
 * Run AFTER enrich:videos since it reads video-durations.json for the ID list.
 *
 * Run: npm run enrich:live
 */

import 'dotenv/config';
import fs from 'fs';
import { google } from 'googleapis';

const DURATIONS_FILE = 'output/video-durations.json';
const LIVE_FILE      = 'output/video-live.json';
const BATCH_SIZE     = 50;
const DELAY_MS       = 60;

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

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
  if (!fs.existsSync(DURATIONS_FILE)) {
    console.error(`ERROR: ${DURATIONS_FILE} not found. Run "npm run enrich:videos" first.`);
    process.exit(1);
  }

  const durations: Record<string, number | null> =
    JSON.parse(fs.readFileSync(DURATIONS_FILE, 'utf-8'));

  // All known video IDs (including nulls — deleted videos can still have had live data)
  const allIds = Object.keys(durations);
  console.log(`Video IDs a verificar: ${allIds.length.toLocaleString('es-AR')}`);

  // Load existing cache
  const liveData: Record<string, boolean> = fs.existsSync(LIVE_FILE)
    ? JSON.parse(fs.readFileSync(LIVE_FILE, 'utf-8'))
    : {};

  const cachedCount = Object.keys(liveData).length;
  if (cachedCount > 0) {
    console.log(`Cache: ${cachedCount.toLocaleString('es-AR')} IDs ya verificados`);
  }

  const toFetch = allIds.filter(id => !(id in liveData));
  console.log(`A fetchear: ${toFetch.length.toLocaleString('es-AR')} IDs nuevos`);

  if (toFetch.length === 0) {
    const liveCount = Object.values(liveData).filter(Boolean).length;
    console.log(`Nada nuevo. ${liveCount.toLocaleString('es-AR')} vivos conocidos en caché.`);
    return;
  }

  const batches = chunks(toFetch, BATCH_SIZE);
  let fetched = 0, liveCount = 0;
  const errors: string[] = [];

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    try {
      const res = await youtube.videos.list({
        part: ['liveStreamingDetails'],
        id: batch,
      });

      // IDs returned by the API — deleted/private videos won't appear
      const returned = new Set((res.data.items ?? []).map(i => i.id!));

      for (const item of res.data.items ?? []) {
        // actualStartTime exists only for videos that were live broadcasts
        const wasLive = !!(item.liveStreamingDetails?.actualStartTime);
        liveData[item.id!] = wasLive;
        if (wasLive) liveCount++;
      }

      // Deleted/private videos: mark as false (not live, and we can't check again)
      for (const id of batch) {
        if (!returned.has(id)) liveData[id] = false;
      }
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      errors.push(`Batch ${bi + 1}: ${msg}`);
      console.error(`\n  Error en batch ${bi + 1}: ${msg}`);
    }

    fetched += batch.length;
    process.stdout.write(
      `\r  ${fetched}/${toFetch.length} — 📡 ${liveCount} vivos encontrados`
    );

    if (DELAY_MS > 0) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log('\nEscribiendo video-live.json...');
  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync(LIVE_FILE, JSON.stringify(liveData));

  const totalLive  = Object.values(liveData).filter(Boolean).length;
  const totalKnown = Object.keys(liveData).length;

  console.log(`\nListo.`);
  console.log(`  📡 ${totalLive.toLocaleString('es-AR')} vivos confirmados`);
  console.log(`  📹 ${(totalKnown - totalLive).toLocaleString('es-AR')} videos normales/shorts`);
  console.log(`  ${totalKnown.toLocaleString('es-AR')} IDs totales en caché → ${LIVE_FILE}`);
  if (errors.length > 0) {
    console.warn(`\n  ${errors.length} batches con error (se reintentarán al re-correr):`);
    errors.slice(0, 5).forEach(e => console.warn('  ' + e));
  }
  console.log('\nPróximo paso: npm run report:html');
}

main().catch(e => { console.error(e); process.exit(1); });
