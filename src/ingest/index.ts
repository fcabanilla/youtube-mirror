import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import type { Channel, TakeoutEntry } from '../types.js';

const DATA_DIR = 'data';
const OUTPUT_FILE = 'output/channels.json';

// Spanish month names → month number (1-based)
const ES_MONTHS: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
};

/**
 * Parse a Spanish Takeout timestamp to ISO 8601 UTC.
 * Format: "20 may 2026, 5:39:37 p.m. GMT-03:00"
 */
function parseSpanishTimestamp(raw: string): string {
  const m = raw.trim().match(
    /(\d{1,2})\s+(\w{3})\s+(\d{4}),\s+(\d{1,2}):(\d{2}):(\d{2})\s+(a\.m\.|p\.m\.)\s+GMT([+-]\d{2}):(\d{2})/
  );
  if (!m) return '';

  const [, day, mon, year, h, min, sec, ampm, tzH, tzM] = m;
  let hour = parseInt(h, 10);
  if (ampm === 'p.m.' && hour !== 12) hour += 12;
  if (ampm === 'a.m.' && hour === 12) hour = 0;

  const month = ES_MONTHS[mon.toLowerCase()] ?? 1;
  // Build UTC by subtracting the timezone offset
  const local = new Date(
    parseInt(year), month - 1, parseInt(day),
    hour, parseInt(min), parseInt(sec)
  );
  const offsetMs = (parseInt(tzH) * 60 + parseInt(tzM)) * 60_000;
  return new Date(local.getTime() - offsetMs).toISOString();
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&emsp;/g, ' ')
    .replace(/&nbsp;/g, ' ');
}

/**
 * Parse the Spanish HTML Takeout format for watch history.
 * Each entry is a <div class="outer-cell ..."> block containing:
 *   "Has visto <a href="VIDEO_URL">TITLE</a><br><a href="CHANNEL_URL">CHANNEL</a><br>TIMESTAMP"
 */
function parseWatchHistoryHtml(filePath: string): Map<string, Channel> {
  console.log('Parsing watch history (HTML format)...');
  const raw = fs.readFileSync(filePath, 'utf-8');

  const channels = new Map<string, Channel>();
  let totalEntries = 0;
  let skipped = 0;

  // Each watch entry follows the pattern:
  // Has visto <a href="VIDEO_URL">TITLE</a><br><a href="CHANNEL_URL">CHANNEL_NAME</a><br>TIMESTAMP<br>
  const entryPattern =
    /Has visto\s+<a href="(https:\/\/www\.youtube\.com\/watch\?v=[^"]+)">[^<]*<\/a><br>\s*<a href="(https:\/\/www\.youtube\.com\/channel\/([^"]+))">(.*?)<\/a><br>\s*([\d][\d\s\w:.,+-]+?)<br>/g;

  let match: RegExpExecArray | null;
  while ((match = entryPattern.exec(raw)) !== null) {
    totalEntries++;
    const [, videoUrl, channelUrl, channelId, channelNameRaw, timestampRaw] = match;
    const channelName = decodeHtmlEntities(channelNameRaw.trim());
    const time = parseSpanishTimestamp(timestampRaw);

    const existing = channels.get(channelId);
    if (!existing) {
      channels.set(channelId, {
        channelId,
        channelName,
        channelUrl,
        watchCount: 1,
        lastWatched: time,
        firstWatched: time,
        isSubscribed: false,
      });
    } else {
      existing.watchCount++;
      if (time > existing.lastWatched) existing.lastWatched = time;
      if (time < existing.firstWatched) existing.firstWatched = time;
    }
  }

  // Count deleted/private entries (no channel link)
  const deletedPattern = /Has visto un video que[^<]*<br>/g;
  while (deletedPattern.exec(raw) !== null) skipped++;

  console.log(`  Found ${channels.size} unique channels from ${totalEntries} watch events (${skipped} deleted/private skipped)`);
  return channels;
}

function parseWatchHistoryJson(filePath: string): Map<string, Channel> {
  console.log('Parsing watch history (JSON format)...');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const entries: TakeoutEntry[] = JSON.parse(raw);
  const channels = new Map<string, Channel>();

  for (const entry of entries) {
    if (!entry.subtitles?.length || !entry.titleUrl?.includes('youtube.com/watch')) continue;
    const sub = entry.subtitles[0];
    if (!sub.url?.includes('/channel/')) continue;

    const channelId = sub.url.match(/\/channel\/(UC[\w-]+)/)?.[1] ?? '';
    if (!channelId) continue;

    const existing = channels.get(channelId);
    if (!existing) {
      channels.set(channelId, {
        channelId,
        channelName: sub.name,
        channelUrl: sub.url,
        watchCount: 1,
        lastWatched: entry.time,
        firstWatched: entry.time,
        isSubscribed: false,
      });
    } else {
      existing.watchCount++;
      if (entry.time > existing.lastWatched) existing.lastWatched = entry.time;
      if (entry.time < existing.firstWatched) existing.firstWatched = entry.time;
    }
  }

  console.log(`  Found ${channels.size} unique channels from ${entries.length} watch events`);
  return channels;
}

function parseSubscriptions(filePath: string): Set<string> {
  console.log('Parsing subscriptions...');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter(l => !l.startsWith('#'));
  const records: Array<Record<string, string>> = parse(lines.join('\n'), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  // Google Takeout locale variants:
  // English: "Channel Id" | Spanish: "ID del canal"
  const ids = new Set(
    records.map(r => r['Channel Id'] ?? r['ID del canal'] ?? '').filter(Boolean)
  );
  console.log(`  Found ${ids.size} subscriptions`);
  return ids;
}

function findFile(dir: string, ...names: string[]): string | null {
  const candidates = fs.readdirSync(dir, { recursive: true }) as string[];
  const found = candidates.find(f => names.includes(path.basename(f)));
  return found ? path.join(dir, found) : null;
}

async function main() {
  // Detect watch history file — JSON preferred, HTML fallback (Spanish Takeout exports HTML by default)
  const historyJsonFile = findFile(DATA_DIR, 'watch-history.json', 'historial-de-reproduccion.json');
  const historyHtmlFile = findFile(DATA_DIR,
    'historial-de-reproducciones.html', 'watch-history.html', 'historial de reproducciones.html'
  );

  if (!historyJsonFile && !historyHtmlFile) {
    console.error('ERROR: No watch history file found in data/');
    console.error('Expected: watch-history.json, historial-de-reproduccion.json, or historial-de-reproducciones.html');
    process.exit(1);
  }

  const channels = historyJsonFile
    ? parseWatchHistoryJson(historyJsonFile)
    : parseWatchHistoryHtml(historyHtmlFile!);

  // Subscriptions — English or Spanish filename
  const subsFile = findFile(DATA_DIR, 'subscriptions.csv', 'suscripciones.csv');
  if (subsFile) {
    const subscribedIds = parseSubscriptions(subsFile);
    for (const id of subscribedIds) {
      if (channels.has(id)) {
        channels.get(id)!.isSubscribed = true;
      } else {
        channels.set(id, {
          channelId: id,
          channelName: 'Unknown (never watched)',
          channelUrl: `https://www.youtube.com/channel/${id}`,
          watchCount: 0,
          lastWatched: '',
          firstWatched: '',
          isSubscribed: true,
        });
      }
    }
    const zombieCount = [...subscribedIds].filter(
      id => !channels.has(id) || channels.get(id)!.watchCount === 0
    ).length;
    console.log(`  ${zombieCount} subscriptions never watched`);
  } else {
    console.warn('WARN: No subscriptions file found — skipping');
  }

  fs.mkdirSync('output', { recursive: true });
  const result = [...channels.values()].sort((a, b) => b.watchCount - a.watchCount);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  console.log(`\nDone. ${result.length} channels saved to ${OUTPUT_FILE}`);
}

main();
