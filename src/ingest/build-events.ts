/**
 * Reads watch history and generates output/events.json
 * Format: { channelId: [[title, url, date], ...] }  (sorted by date desc, max 60 per channel)
 * Run: npm run events
 */
import fs from 'fs';
import path from 'path';
import type { TakeoutEntry } from '../types.js';

const DATA_DIR = 'data';
const EVENTS_FILE = 'output/events.json';

const ES_MONTHS: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
};

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
  const local = new Date(parseInt(year), month - 1, parseInt(day), hour, parseInt(min), parseInt(sec));
  const offsetMs = (parseInt(tzH) * 60 + parseInt(tzM)) * 60_000;
  return new Date(local.getTime() - offsetMs).toISOString();
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&emsp;/g, ' ').replace(/&nbsp;/g, ' ');
}

function findFile(dir: string, ...names: string[]): string | null {
  const candidates = fs.readdirSync(dir, { recursive: true }) as string[];
  const found = candidates.find(f => names.includes(path.basename(f)));
  return found ? path.join(dir, found) : null;
}

// channelId → [title, url, date][]
type EventMap = Map<string, [string, string, string][]>;

function parseHtml(filePath: string): EventMap {
  console.log('Parsing HTML watch history for video events...');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const events: EventMap = new Map();

  const pattern =
    /Has visto\s+<a href="(https:\/\/www\.youtube\.com\/watch\?v=[^"]+)">(.*?)<\/a><br>\s*<a href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]+)">[^<]*<\/a><br>\s*([\d][\d\s\w:.,+-]+?)<br>/g;

  let total = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const [, videoUrl, titleRaw, channelId, tsRaw] = match;
    const title = decodeHtmlEntities(titleRaw.trim());
    const date = parseSpanishTimestamp(tsRaw);
    const list = events.get(channelId) ?? [];
    list.push([title, videoUrl, date]);
    events.set(channelId, list);
    total++;
  }
  console.log(`  ${total} video events from ${events.size} channels`);
  return events;
}

function parseJson(filePath: string): EventMap {
  console.log('Parsing JSON watch history for video events...');
  const entries: TakeoutEntry[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const events: EventMap = new Map();
  for (const e of entries) {
    if (!e.subtitles?.length || !e.titleUrl?.includes('youtube.com/watch')) continue;
    const sub = e.subtitles[0];
    if (!sub.url?.includes('/channel/')) continue;
    const channelId = sub.url.match(/\/channel\/(UC[\w-]+)/)?.[1] ?? '';
    if (!channelId) continue;
    const list = events.get(channelId) ?? [];
    list.push([e.title.replace(/^Has visto\s+/i, '').trim(), e.titleUrl, e.time]);
    events.set(channelId, list);
  }
  console.log(`  ${[...events.values()].reduce((s, v) => s + v.length, 0)} events from ${events.size} channels`);
  return events;
}

function main() {
  const jsonFile = findFile(DATA_DIR, 'watch-history.json', 'historial-de-reproduccion.json');
  const htmlFile = findFile(DATA_DIR, 'historial-de-reproducciones.html', 'watch-history.html', 'historial de reproducciones.html');

  if (!jsonFile && !htmlFile) {
    console.error('No watch history file found in data/');
    process.exit(1);
  }

  const events = jsonFile ? parseJson(jsonFile) : parseHtml(htmlFile!);

  // Build output: channelId → events sorted by date desc, capped at 60
  const output: Record<string, [string, string, string][]> = {};
  for (const [channelId, evts] of events) {
    const sorted = evts
      .filter(([, , d]) => d)                     // only events with parseable dates
      .sort((a, b) => b[2].localeCompare(a[2]));   // newest first
    if (sorted.length > 0) {
      output[channelId] = sorted.slice(0, 60);
    }
  }

  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(output));
  const totalEvts = Object.values(output).reduce((s, v) => s + v.length, 0);
  console.log(`Done. ${totalEvts} events for ${Object.keys(output).length} channels → ${EVENTS_FILE}`);
}

main();
