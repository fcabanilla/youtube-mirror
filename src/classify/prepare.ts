/**
 * Generates output/to_classify.md — a readable list of unclassified channels.
 * Run this, then ask your AI assistant (Claude Code, Copilot, Gemini, etc.)
 * to classify them using the CLAUDE.md taxonomy.
 */
import fs from 'fs';
import type { Channel } from '../types.js';

const CHANNELS_FILE = 'output/channels.json';
const OUTPUT_FILE = 'output/to_classify.md';

const channels: Channel[] = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf-8'));

// Only classify enriched channels with a real name, sorted by watchCount desc
// Focus on watchCount >= 3 (meaningful consumption) + subscribed (zombie audit)
const unclassified = channels
  .filter(c =>
    !c.classifiedAt &&
    c.enrichedAt &&
    c.channelName &&
    c.channelName !== 'Unknown (never watched)' &&
    (c.watchCount >= 3 || c.isSubscribed)
  )
  .sort((a, b) => b.watchCount - a.watchCount);

if (unclassified.length === 0) {
  console.log('All channels are already classified.');
  process.exit(0);
}

const lines = [
  `# Channels to classify (${unclassified.length})`,
  '',
  'For each channel, assign a `categoryPrimary` and optionally a `categorySecondary` from the taxonomy in CLAUDE.md.',
  '',
  '---',
  '',
  ...unclassified.map(c => [
    `## ${c.channelName}`,
    `- **ID:** ${c.channelId}`,
    `- **Watch count:** ${c.watchCount}`,
    `- **Subscribed:** ${c.isSubscribed ? 'yes' : 'no'}`,
    `- **Format:** ${c.format ?? 'unknown'}`,
    `- **Description:** ${c.description?.slice(0, 300) ?? 'N/A'}`,
    '',
  ].join('\n')),
];

fs.writeFileSync(OUTPUT_FILE, lines.join('\n'));
console.log(`Ready: ${OUTPUT_FILE} — ${unclassified.length} channels to classify.`);
console.log('Now ask your AI assistant to classify them (see CLAUDE.md for instructions).');
