import 'dotenv/config';
import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import type { Channel } from '../types.js';

const CHANNELS_FILE = 'output/channels.json';
const BATCH_SIZE = 30; // channels per Claude call

const client = new Anthropic();

const VALID_CATEGORIES = [
  'tech/hardware', 'tech/software', 'tech/gaming',
  'news/argentina', 'news/international',
  'opinion/economics', 'opinion/general',
  'entertainment/humor', 'entertainment/sports', 'entertainment/lifestyle',
  'education/science', 'education/history', 'education/skills',
  'uncategorized',
];

interface ClassifyResult {
  channelId: string;
  categoryPrimary: string;
  categorySecondary?: string;
}

async function classifyBatch(batch: Channel[]): Promise<ClassifyResult[]> {
  const channelList = batch.map(c =>
    `ID: ${c.channelId}\nName: ${c.channelName}\nDescription: ${c.description?.slice(0, 200) ?? 'N/A'}`
  ).join('\n---\n');

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: `You are classifying YouTube channels into categories.
Valid categories: ${VALID_CATEGORIES.join(', ')}.
Respond ONLY with a JSON array, no explanation. Each object: { "channelId": string, "categoryPrimary": string, "categorySecondary"?: string }
Use "uncategorized" when there is not enough information.`,
    messages: [
      {
        role: 'user',
        content: `Classify these YouTube channels:\n\n${channelList}`,
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`Unexpected Claude response: ${text.slice(0, 200)}`);

  const results: ClassifyResult[] = JSON.parse(jsonMatch[0]);
  // Sanitize: ensure only valid categories are used
  return results.map(r => ({
    ...r,
    categoryPrimary: VALID_CATEGORIES.includes(r.categoryPrimary) ? r.categoryPrimary : 'uncategorized',
    categorySecondary: r.categorySecondary && VALID_CATEGORIES.includes(r.categorySecondary)
      ? r.categorySecondary
      : undefined,
  }));
}

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY not set in .env');
    process.exit(1);
  }

  const channels: Channel[] = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf-8'));

  // Only classify channels with a name (enriched) and not yet classified
  const toClassify = channels.filter(c =>
    !c.classifiedAt && c.channelName && c.channelName !== 'Unknown (never watched)'
  );

  console.log(`Classifying ${toClassify.length} channels with Claude...`);

  let classified = 0;
  for (const batch of chunks(toClassify, BATCH_SIZE)) {
    try {
      const results = await classifyBatch(batch);
      const resultMap = new Map(results.map(r => [r.channelId, r]));

      for (const channel of batch) {
        const result = resultMap.get(channel.channelId);
        if (result) {
          channel.categoryPrimary = result.categoryPrimary;
          channel.categorySecondary = result.categorySecondary;
        } else {
          channel.categoryPrimary = 'uncategorized';
        }
        channel.classifiedAt = new Date().toISOString();
      }

      classified += batch.length;
      process.stdout.write(`\r  ${classified}/${toClassify.length}`);
    } catch (err) {
      console.error(`\n  Batch failed: ${err}`);
      // Mark failed batch as uncategorized so they can be retried later
      for (const channel of batch) {
        if (!channel.classifiedAt) {
          channel.categoryPrimary = 'uncategorized';
          channel.classifiedAt = new Date().toISOString();
        }
      }
    }

    // Avoid hitting rate limits
    await new Promise(r => setTimeout(r, 500));
  }

  console.log();
  fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2));
  console.log(`\nDone. ${toClassify.length} channels classified.`);
}

main();
