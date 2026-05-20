import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import type { Channel, TakeoutEntry } from '../types.js';

const DATA_DIR = 'data';
const OUTPUT_FILE = 'output/channels.json';

function extractChannelId(url: string): string {
  const match = url.match(/\/channel\/(UC[\w-]+)/);
  return match ? match[1] : url;
}

function parseWatchHistory(filePath: string): Map<string, Channel> {
  console.log('Parsing watch history...');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const entries: TakeoutEntry[] = JSON.parse(raw);

  const channels = new Map<string, Channel>();

  for (const entry of entries) {
    // Skip ads, deleted videos, and non-YouTube entries
    if (!entry.subtitles?.length || !entry.titleUrl?.includes('youtube.com/watch')) continue;

    const sub = entry.subtitles[0];
    if (!sub.url?.includes('/channel/')) continue;

    const channelId = extractChannelId(sub.url);
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

  // Skip comment lines that Google Takeout adds before the CSV header
  const lines = raw.split('\n').filter(l => !l.startsWith('#'));
  const cleaned = lines.join('\n');

  const records: Array<{ 'Channel Id': string }> = parse(cleaned, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const ids = new Set(records.map(r => r['Channel Id']));
  console.log(`  Found ${ids.size} subscriptions`);
  return ids;
}

function findFile(dir: string, name: string): string | null {
  const candidates = fs.readdirSync(dir, { recursive: true }) as string[];
  const found = candidates.find(f => path.basename(f) === name);
  return found ? path.join(dir, found) : null;
}

async function main() {
  const historyFile = findFile(DATA_DIR, 'watch-history.json');
  const subsFile = findFile(DATA_DIR, 'subscriptions.csv');

  if (!historyFile) {
    console.error('ERROR: watch-history.json not found in data/');
    console.error('Download your Google Takeout and place the files in data/');
    process.exit(1);
  }

  const channels = parseWatchHistory(historyFile);

  if (subsFile) {
    const subscribedIds = parseSubscriptions(subsFile);
    for (const id of subscribedIds) {
      if (channels.has(id)) {
        channels.get(id)!.isSubscribed = true;
      } else {
        // Subscribed but never watched — still include them
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
    console.log(`  ${[...subscribedIds].filter(id => !channels.has(id) || channels.get(id)!.watchCount === 0).length} subscriptions never watched`);
  } else {
    console.warn('WARN: subscriptions.csv not found — skipping subscription data');
  }

  fs.mkdirSync('output', { recursive: true });
  const result = [...channels.values()].sort((a, b) => b.watchCount - a.watchCount);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  console.log(`\nDone. ${result.length} channels saved to ${OUTPUT_FILE}`);
}

main();
