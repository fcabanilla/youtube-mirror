import fs from 'fs';
import path from 'path';

const CHANNELS_FILE = path.resolve('output/channels.json');

// Direct 1-to-1 renames
const RENAMES: Record<string, string> = {
  'tech/gaming':      'gaming',
  'news/argentina':   'politics/argentina',
  'news/international': 'politics/geopolitics',
  'education/science':  'science',
  'opinion/general':    'entertainment/podcast',
};

// Channels that need a specific new category regardless of their old one
const CHANNEL_OVERRIDES: Record<string, string> = {
  // entertainment/sports → sports/simracing
  'UCghIPqIy3syDuqtXh69Ufbg': 'sports/simracing', // Borja Zazo Simracing
  'UC3gdaplfyzSr2YjHHwxRhPQ': 'sports/simracing', // Heikki360ES
  'UC04Yi550wbwSWJIRjZm_dvg': 'sports/simracing', // GITGUD Racing

  // entertainment/sports → sports/f1
  'UCgrWL3ZYxUjNEQ0gZTtp2Iw': 'sports/f1',        // Sportmaniaticos
  'UCbsCmBNSW6mf9DGW3g5VlNA': 'sports/f1',        // David Perogil F1
  'UCPIgqTAeWOgNvrjsGY68JSw': 'sports/f1',        // Laca Stream

  // education/skills → hobby/lego
  'UCiZKQvmrtQzecByWmMg7fnw': 'hobby/lego',       // Master Builder Alec
  'UCrqDcwLssaU6YyzzQioxxdQ': 'hobby/lego',       // Sam Builds
  'UCHzmAVaBC9ORwY7i91k5l1Q': 'hobby/lego',       // Juanjo Bricks
  'UCYCcMzsmrwfsktcD7TP9bww': 'hobby/lego',       // Brick Master Harri

  // education/skills → hobby/diy
  'UCsGYMvcMeUCxXIx--A7SU6w': 'hobby/diy',        // Javier Romero
  'UCCOrp7GPgZA8EGrbOcIAsyQ': 'hobby/diy',        // Phone Repair Guru
  'UCYWh9eJKxYTt9wTRZj5hVDA': 'hobby/diy',        // The Lawn Tools
  'UCrQFAB5KEroViBiyg7WDcqQ': 'hobby/diy',        // LOS CAZA JUGUETES

  // gaming → entertainment/mystery (El Escoces watched as curiosidades históricas, NOT gaming)
  'UC15QE9U_c5QZd1qKP57_hMA': 'entertainment/mystery',

  // opinion/general → politics/argentina
  'UC-40U87JsevMIMn7PMw4jPw': 'politics/argentina', // Neura Media (Fantino)

  // entertainment/sports (remaining) → sports/general
};

type Channel = {
  channelId: string;
  categoryPrimary?: string;
  categorySecondary?: string;
  [key: string]: unknown;
};

const channels: Channel[] = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf-8'));

let renamed = 0;
let overridden = 0;
let sportsGeneral = 0;

for (const ch of channels) {
  // 1. Channel-specific overrides take priority
  if (ch.channelId && CHANNEL_OVERRIDES[ch.channelId]) {
    const newCat = CHANNEL_OVERRIDES[ch.channelId];
    if (ch.categoryPrimary !== newCat) {
      ch.categoryPrimary = newCat;
      overridden++;
    }
    continue;
  }

  // 2. entertainment/sports remainder → sports/general
  if (ch.categoryPrimary === 'entertainment/sports') {
    ch.categoryPrimary = 'sports/general';
    sportsGeneral++;
    continue;
  }

  // 3. 1-to-1 renames
  if (ch.categoryPrimary && RENAMES[ch.categoryPrimary]) {
    ch.categoryPrimary = RENAMES[ch.categoryPrimary];
    renamed++;
  }

  // Also migrate secondary category if it uses an old key
  if (ch.categorySecondary && RENAMES[ch.categorySecondary]) {
    ch.categorySecondary = RENAMES[ch.categorySecondary];
  }
  if (ch.categorySecondary === 'entertainment/sports') {
    ch.categorySecondary = 'sports/general';
  }
}

fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2));

console.log(`✓ Migración completa:`);
console.log(`  ${renamed} canales renombrados (1-to-1)`);
console.log(`  ${overridden} canales con override específico`);
console.log(`  ${sportsGeneral} canales → sports/general`);
console.log(`  Total procesados: ${channels.length}`);
