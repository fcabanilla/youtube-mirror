import 'dotenv/config';
import fs from 'fs';
import { google } from 'googleapis';
import type { Channel } from '../types.js';

const CHANNELS_FILE = 'output/channels.json';
const BATCH_SIZE = 50; // YouTube API allows up to 50 IDs per call

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

// Uploads playlist: replace "UC" prefix with "UU" to get the channel's uploads playlist
function uploadsPlaylistId(channelId: string): string {
  return channelId.startsWith('UC') ? 'UU' + channelId.slice(2) : channelId;
}

function formatFromAvgDuration(avgSeconds: number): Channel['format'] {
  if (avgSeconds < 180) return 'shorts-first';   // < 3 min
  if (avgSeconds > 480) return 'long-form';       // > 8 min
  return 'mixed';
}

async function getChannelStats(channelIds: string[]): Promise<Map<string, Partial<Channel>>> {
  const res = await youtube.channels.list({
    part: ['snippet', 'statistics'],
    id: channelIds,
    maxResults: BATCH_SIZE,
  });

  const result = new Map<string, Partial<Channel>>();
  for (const item of res.data.items ?? []) {
    result.set(item.id!, {
      channelName: item.snippet?.title ?? undefined,
      description: item.snippet?.description?.slice(0, 500) ?? undefined,
      subscriberCount: parseInt(item.statistics?.subscriberCount ?? '0', 10),
      uploadCount: parseInt(item.statistics?.videoCount ?? '0', 10),
    });
  }
  return result;
}

async function getAvgDuration(channelId: string): Promise<number | null> {
  try {
    // Get last 10 video IDs from uploads playlist
    const playlistRes = await youtube.playlistItems.list({
      part: ['contentDetails'],
      playlistId: uploadsPlaylistId(channelId),
      maxResults: 10,
    });

    const videoIds = (playlistRes.data.items ?? [])
      .map(i => i.contentDetails?.videoId)
      .filter(Boolean) as string[];

    if (videoIds.length === 0) return null;

    // Get durations
    const videosRes = await youtube.videos.list({
      part: ['contentDetails'],
      id: videoIds,
    });

    const durations = (videosRes.data.items ?? []).map(v => {
      const iso = v.contentDetails?.duration ?? 'PT0S';
      // Parse ISO 8601 duration (PT#H#M#S)
      const hours = parseInt(iso.match(/(\d+)H/)?.[1] ?? '0', 10);
      const mins = parseInt(iso.match(/(\d+)M/)?.[1] ?? '0', 10);
      const secs = parseInt(iso.match(/(\d+)S/)?.[1] ?? '0', 10);
      return hours * 3600 + mins * 60 + secs;
    });

    if (durations.length === 0) return null;
    return durations.reduce((a, b) => a + b, 0) / durations.length;
  } catch {
    return null;
  }
}

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

async function main() {
  if (!process.env.YOUTUBE_API_KEY) {
    console.error('ERROR: YOUTUBE_API_KEY not set in .env');
    process.exit(1);
  }

  const channels: Channel[] = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf-8'));
  const toEnrich = channels.filter(c => !c.enrichedAt && c.channelId.startsWith('UC'));

  console.log(`Enriching ${toEnrich.length} channels via YouTube API...`);

  // Step 1: batch fetch channel stats (50 per call)
  let enriched = 0;
  for (const batch of chunks(toEnrich, BATCH_SIZE)) {
    const stats = await getChannelStats(batch.map(c => c.channelId));
    for (const channel of batch) {
      const data = stats.get(channel.channelId);
      if (data) Object.assign(channel, data);
    }
    enriched += batch.length;
    process.stdout.write(`\r  Stats: ${enriched}/${toEnrich.length}`);
  }
  console.log();

  // Step 2: get avg duration per channel (2 API calls per channel — do top 200 by watch count)
  const toCheckDuration = toEnrich
    .filter(c => !c.format)
    .sort((a, b) => b.watchCount - a.watchCount)
    .slice(0, 200);

  console.log(`Checking video durations for top ${toCheckDuration.length} channels...`);
  let durationChecked = 0;
  for (const channel of toCheckDuration) {
    const avg = await getAvgDuration(channel.channelId);
    if (avg !== null) {
      channel.avgDurationSeconds = Math.round(avg);
      channel.format = formatFromAvgDuration(avg);
    } else {
      channel.format = 'unknown';
    }
    channel.enrichedAt = new Date().toISOString();
    durationChecked++;
    process.stdout.write(`\r  Duration: ${durationChecked}/${toCheckDuration.length} (${channel.channelName?.slice(0, 30)})`);
    // Small delay to stay within API quota
    await new Promise(r => setTimeout(r, 100));
  }
  console.log();

  // Mark remaining as enriched without duration
  for (const channel of toEnrich) {
    if (!channel.enrichedAt) {
      channel.format = 'unknown';
      channel.enrichedAt = new Date().toISOString();
    }
  }

  fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2));
  console.log(`\nDone. ${toEnrich.length} channels enriched.`);
}

main();
