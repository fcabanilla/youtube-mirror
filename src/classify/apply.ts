/**
 * Applies classifications from output/classifications.json into output/channels.json.
 * The AI assistant produces classifications.json — this script merges them back.
 *
 * Expected format for classifications.json:
 * [
 *   { "channelId": "UCxxxxx", "categoryPrimary": "tech/hardware", "categorySecondary": "tech/gaming" },
 *   ...
 * ]
 */
import fs from 'fs';
import type { Channel } from '../types.js';

interface Classification {
  channelId: string;
  categoryPrimary: string;
  categorySecondary?: string;
}

const CHANNELS_FILE = 'output/channels.json';
const CLASSIFICATIONS_FILE = 'output/classifications.json';

if (!fs.existsSync(CLASSIFICATIONS_FILE)) {
  console.error(`ERROR: ${CLASSIFICATIONS_FILE} not found.`);
  console.error('Ask your AI assistant to classify the channels and save the result to that file.');
  process.exit(1);
}

const channels: Channel[] = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf-8'));
const classifications: Classification[] = JSON.parse(fs.readFileSync(CLASSIFICATIONS_FILE, 'utf-8'));

const classMap = new Map(classifications.map(c => [c.channelId, c]));
let applied = 0;

for (const channel of channels) {
  const cl = classMap.get(channel.channelId);
  if (cl) {
    channel.categoryPrimary = cl.categoryPrimary;
    channel.categorySecondary = cl.categorySecondary;
    channel.classifiedAt = new Date().toISOString();
    applied++;
  }
}

fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2));
console.log(`Applied ${applied} classifications to ${CHANNELS_FILE}.`);
