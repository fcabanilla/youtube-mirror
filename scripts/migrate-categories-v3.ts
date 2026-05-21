import fs from 'fs';
import path from 'path';

const CHANNELS_FILE = path.resolve('output/channels.json');

// Old slug → new slug (1-to-1 bulk renames)
const RENAMES: Record<string, string> = {
  'politics/argentina':      'actualidad/argentina',
  'politics/geopolitics':    'actualidad/geopolitica',
  'opinion/economics':       'negocios/libertarismo',
  'sports/f1':               'deportes/automovilismo',
  'sports/simracing':        'deportes/simracing',
  'sports/general':          'deportes/general',
  'gaming':                  'tech/videojuegos',
  'tech/hardware':           'tech/hardware',
  'tech/software':           'tech/programacion',
  'science':                 'ciencias/ingenieria',   // safe default; specific overrides below
  'entertainment/humor':     'arte/humor',
  'entertainment/mystery':   'arte/misterio',
  'entertainment/podcast':   'arte/podcast',
  'entertainment/lifestyle': 'lifestyle/viajes',      // safe default
  'hobby/lego':              'hobbies/lego',
  'hobby/diy':               'hobbies/bricolaje',
  'education/history':       'educacion/historia',
};

// Channel-level overrides (take priority over bulk renames)
const CHANNEL_OVERRIDES: Record<string, string> = {
  // Ciencias — subdisciplinas específicas
  'UCXcRErqJBmvlQGeqgIemuiA': 'ciencias/medicina',    // Miguel ASSAL
  'UC0z91or00IFw5xK5PXTQzqw': 'ciencias/aviacion',    // Sergio Hidalgo
  'UCbhgykBEnlKpEWCmVpmnXSg': 'ciencias/aviacion',    // Ingeniero Espacial
  'UCTeFgT77A2LNTb05VcCW71Q': 'ciencias/fisica',      // Breaking Vlad
  'UCOWFKaCN-rzmYk502JFWnqg': 'ciencias/matematicas', // Eze Martínez
  'UC0z91or00IFw5xK5PXTQzqw': 'ciencias/aviacion',    // Sergio Hidalgo

  // Lifestyle — subdisciplinas específicas
  'UCM2MONuYe8IH8W-gYZgYxNg': 'lifestyle/mascotas',  // Vetventures
  'UCCc5EqGKYAJWgwOUnRYmURQ': 'lifestyle/cocina',     // CHEFSCHWARZ
  'UC182_l05xymX0Nfeh9sFOiA': 'arte/lifestyle',       // Bouncer Power (vida nocturna)

  // Hobbies — overrides específicos
  'UCrQFAB5KEroViBiyg7WDcqQ': 'hobbies/coleccionismo', // LOS CAZA JUGUETES

  // Tech — overrides específicos
  'UCFOSg71CRAJ58IPuV_-jMbw': 'tech/gadgets',          // Tecnonauta

  // Negocios — spicy4tuna es más negocios globales que libertarismo
  'UCUWDBUEo1YFTzZnBV1aFDBw': 'negocios/global',       // spicy4tuna
};

type Channel = { channelId: string; categoryPrimary?: string; categorySecondary?: string; [k: string]: unknown };

const channels: Channel[] = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf-8'));

let overridden = 0, renamed = 0, unchanged = 0;

for (const ch of channels) {
  if (ch.channelId && CHANNEL_OVERRIDES[ch.channelId]) {
    ch.categoryPrimary = CHANNEL_OVERRIDES[ch.channelId];
    overridden++;
    continue;
  }
  if (ch.categoryPrimary && RENAMES[ch.categoryPrimary]) {
    ch.categoryPrimary = RENAMES[ch.categoryPrimary];
    renamed++;
  } else {
    unchanged++;
  }
  if (ch.categorySecondary && RENAMES[ch.categorySecondary]) {
    ch.categorySecondary = RENAMES[ch.categorySecondary];
  }
}

fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2));
console.log(`✓ Migración v3 completa:`);
console.log(`  ${overridden} overrides específicos por canal`);
console.log(`  ${renamed} renames bulk`);
console.log(`  ${unchanged} sin cambios (ya en nuevo formato o uncategorized)`);
