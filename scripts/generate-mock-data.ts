/**
 * Generates realistic mock data for testing the youtube-mirror pipeline.
 *
 * Schema sources (verified):
 *   - google/takeout README: https://github.com/google/takeout/blob/main/README.md
 *   - google_takeout_parser: https://github.com/purarue/google_takeout_parser
 *
 * watch-history.json fields (from official Google Takeout README):
 *   header         string   — product name, always "YouTube" for watch history
 *   title          string   — "Watched <video title>"
 *   titleUrl       string?  — "https://www.youtube.com/watch?v=VIDEO_ID" (absent for ads/deleted)
 *   subtitles      Array?   — [{ name: string, url: string }] channel info (absent for deleted/ads)
 *   time           string   — ISO 8601 with ms, e.g. "2024-03-15T14:22:00.000Z"
 *   products       string[] — ["YouTube"]
 *   activityControls string[] — ["YouTube watch history"]
 *   details        Array?   — [{ name: string }] e.g. [{ name: "From Google Search" }]
 *
 * subscriptions.csv columns (from Google Takeout official export):
 *   Channel Id,Channel Url,Channel Title
 */

import fs from 'fs';

// --- Channel ID helper ---
// Real YouTube channel IDs: "UC" + 22 chars (A-Za-z0-9_-)  = 24 chars total
function mockId(label: string): string {
  const sanitized = label.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
  return ('UC' + sanitized).padEnd(24, '0');
}

// --- Channel definitions ---
// Covers all taxonomy categories + zombie subscriptions + channels never subscribed
interface MockChannel {
  id: string;
  name: string;
  url: string;
  description: string;
  isSubscribed: boolean;
  watchEvents: number;   // 0 = zombie subscription
  category: string;     // for our reference only, not in the source data
}

const CHANNELS: MockChannel[] = [
  // tech/hardware
  {
    id: mockId('TechReviewsHardware1'),
    name: 'LTT Style Reviews',
    url: '',
    description: 'In-depth PC hardware reviews, benchmarks, and build guides. GPUs, CPUs, SSDs, and everything in between.',
    isSubscribed: true,
    watchEvents: 148,
    category: 'tech/hardware',
  },
  {
    id: mockId('GPUBenchmarksLab22'),
    name: 'GPU Benchmarks Lab',
    url: '',
    description: 'Scientific GPU and CPU benchmarks. Frame time analysis, thermal testing, overclocking guides.',
    isSubscribed: false,
    watchEvents: 34,
    category: 'tech/hardware',
  },
  {
    id: mockId('3DPrintingWorkshop1'),
    name: '3D Printing Workshop',
    url: '',
    description: 'FDM and resin 3D printing tutorials, filament reviews, printer mods, and troubleshooting.',
    isSubscribed: true,
    watchEvents: 52,
    category: 'tech/hardware',
  },

  // tech/software
  {
    id: mockId('DevToolboxChannel11'),
    name: 'Dev Toolbox',
    url: '',
    description: 'Modern web development: TypeScript, React, Node.js, Docker, CI/CD. Real-world projects and best practices.',
    isSubscribed: true,
    watchEvents: 112,
    category: 'tech/software',
  },
  {
    id: mockId('AIExplainedToday11'),
    name: 'AI Explained Today',
    url: '',
    description: 'Machine learning, LLMs, and AI tools explained for developers. Model comparisons, API tutorials, agent frameworks.',
    isSubscribed: true,
    watchEvents: 89,
    category: 'tech/software',
  },

  // tech/gaming
  {
    id: mockId('IndieGameBreakdown'),
    name: 'Indie Game Breakdown',
    url: '',
    description: 'Long-form analysis of indie games: design decisions, dev stories, retrospectives.',
    isSubscribed: true,
    watchEvents: 41,
    category: 'tech/gaming',
  },

  // news/argentina
  {
    id: mockId('AnalisisEconomicoAR'),
    name: 'Análisis Económico AR',
    url: '',
    description: 'Economía argentina, inflación, tipo de cambio, política fiscal. Análisis semanales en profundidad.',
    isSubscribed: true,
    watchEvents: 203,
    category: 'news/argentina',
  },
  {
    id: mockId('PoliticaArgentinaHOY'),
    name: 'Política Argentina HOY',
    url: '',
    description: 'Cobertura de la actualidad política argentina. Entrevistas, análisis y debate.',
    isSubscribed: false,
    watchEvents: 67,
    category: 'news/argentina',
  },
  {
    id: mockId('NoticieroArgentina1'),
    name: 'Noticiero 24hs',
    url: '',
    description: 'Canal de noticias argentino. Cobertura en vivo de los principales hechos del día.',
    isSubscribed: true,
    watchEvents: 19,
    category: 'news/argentina',
  },

  // opinion/economics
  {
    id: mockId('FinanzasParaTodos11'),
    name: 'Finanzas para Todos',
    url: '',
    description: 'Inversiones, ahorro, mercado de capitales argentino. IOL, Balanz, cedears, bonos y plazo fijo.',
    isSubscribed: true,
    watchEvents: 176,
    category: 'opinion/economics',
  },
  {
    id: mockId('TradingCriptoAR0011'),
    name: 'Trading y Cripto AR',
    url: '',
    description: 'Análisis técnico, Bitcoin, Ethereum y altcoins. Estrategias de trading para el mercado local.',
    isSubscribed: true,
    watchEvents: 23,
    category: 'opinion/economics',
  },

  // entertainment/humor
  {
    id: mockId('StandupLatAmerica11'),
    name: 'Standup Latinoamérica',
    url: '',
    description: 'Los mejores specials y clips de standup comedy latinoamericano.',
    isSubscribed: false,
    watchEvents: 38,
    category: 'entertainment/humor',
  },

  // entertainment/sports
  {
    id: mockId('FutbolArgAnalisis11'),
    name: 'Fútbol Argentino Análisis',
    url: '',
    description: 'Análisis táctico, estadísticas y debate del fútbol argentino. Liga Profesional y selección.',
    isSubscribed: true,
    watchEvents: 71,
    category: 'entertainment/sports',
  },

  // education/science
  {
    id: mockId('FisicaCuanticaSimple'),
    name: 'Física Cuántica Simple',
    url: '',
    description: 'Divulgación científica: física cuántica, relatividad, cosmología. Explicado sin matemáticas complejas.',
    isSubscribed: false,
    watchEvents: 94,
    category: 'education/science',
  },
  {
    id: mockId('BiologiaEvolutiva11'),
    name: 'Biología Evolutiva',
    url: '',
    description: 'Evolución, genética, paleontología y biología molecular. Documentales y análisis propios.',
    isSubscribed: false,
    watchEvents: 27,
    category: 'education/science',
  },

  // education/skills
  {
    id: mockId('AprendeTypescript011'),
    name: 'Aprende TypeScript',
    url: '',
    description: 'Cursos completos de TypeScript, Node.js y arquitectura de software. De cero a senior.',
    isSubscribed: true,
    watchEvents: 58,
    category: 'education/skills',
  },

  // Zombie subscriptions — subscribed but never/rarely watched
  {
    id: mockId('CocinaRandomShorts1'),
    name: 'Cocina Random',
    url: '',
    description: 'Recetas rápidas y tips de cocina. Shorts diarios.',
    isSubscribed: true,
    watchEvents: 0,
    category: 'entertainment/lifestyle',
  },
  {
    id: mockId('YogaShortsDaily0011'),
    name: 'Yoga Shorts Daily',
    url: '',
    description: 'Rutinas de yoga de menos de 60 segundos. Shorts.',
    isSubscribed: true,
    watchEvents: 0,
    category: 'education/skills',
  },
  {
    id: mockId('VlogsViaje20190001'),
    name: 'Vlogs de Viaje 2019',
    url: '',
    description: 'Canal de vlogs de viaje. Sin actividad desde 2020.',
    isSubscribed: true,
    watchEvents: 0,
    category: 'entertainment/lifestyle',
  },
  {
    id: mockId('GamingShorts2024001'),
    name: 'Gaming Clips y Shorts',
    url: '',
    description: 'Clips virales de videojuegos. Shorts de momentos graciosos y highlights.',
    isSubscribed: true,
    watchEvents: 2,  // barely watched — subscribed via shorts algorithm
    category: 'tech/gaming',
  },
];

// Assign URLs
for (const ch of CHANNELS) {
  ch.url = `https://www.youtube.com/channel/${ch.id}`;
}

// --- Video title templates per category ---
const VIDEO_TITLES: Record<string, string[]> = {
  'tech/hardware': [
    'RTX 5090 Review: ¿Vale la pena en 2025?',
    'El mejor setup gamer por $500 — Guía completa',
    'Comparativa: DDR5 vs DDR4 en juegos reales',
    'Cómo armar una PC desde cero en 2025',
    'SSD NVMe Gen 5: benchmarks que no vas a creer',
    'Overclocking extremo: batimos el récord mundial',
    'El monitor perfecto para trabajo y gaming',
    'Refrigeración líquida AIO vs custom loop — la verdad',
  ],
  'tech/software': [
    'TypeScript 5.8: todo lo nuevo que necesitás saber',
    'Docker en producción — errores que cometí y cómo evitarlos',
    'Claude vs GPT-4 para programación — comparativa real',
    'CI/CD con GitHub Actions desde cero',
    'Node.js 22: las features que cambian todo',
    'Cómo uso la IA para ser 10x más productivo',
    'React Server Components explicados sin mentiras',
    'Microservicios vs monolito — cuándo usar cada uno',
  ],
  'tech/gaming': [
    'Hollow Knight: análisis de un masterpiece indie',
    'Los 10 mejores indie games de 2024',
    'Hades II: todo lo que sabemos hasta ahora',
    'Returnal: por qué es el juego de la generación',
  ],
  'news/argentina': [
    'La inflación de octubre: qué esperar para noviembre',
    'Milei y el FMI: análisis del nuevo acuerdo',
    'El tipo de cambio en 2025: proyecciones',
    'Resultados de las elecciones: análisis completo',
    'La deuda argentina: quiénes son los acreedores',
    'Reforma del estado: qué organismos desaparecen',
    'El campo y las retenciones: un conflicto eterno',
  ],
  'opinion/economics': [
    'Cómo invertir en cedears desde Argentina — guía 2025',
    'El plazo fijo perdió contra la inflación: ¿qué hacemos?',
    'Dólar MEP: cómo comprarlo paso a paso',
    'Los mejores bonos argentinos para 2025',
    'Bitcoin a $100k: ¿qué significa para los inversores AR?',
    'FCI de money market vs plazo fijo — la comparativa',
    'Acciones argentinas en NYSE: GGAL, BMA, YPFD',
  ],
  'entertainment/humor': [
    'El mejor chiste que contaste — recopilación',
    'Stand up: el trabajo en home office',
    'La familia argentina en Navidad — sketch',
    'Improvisación en vivo — lo mejor del mes',
  ],
  'entertainment/sports': [
    'Boca vs River: análisis táctico del superclásico',
    'La Selección en las eliminatorias — resumen',
    'Los 5 mejores goles de la temporada',
    'Entrevista exclusiva: el futuro del club',
    'Análisis estadístico: por qué perdió Racing',
  ],
  'education/science': [
    'El principio de incertidumbre — explicado de verdad',
    'Agujeros negros: lo que Einstein no sabía',
    'La evolución del Homo sapiens — nuevos descubrimientos',
    'Mecánica cuántica para no físicos',
    'El Big Bang: mitos y realidades',
    'CRISPR: cómo editamos el ADN hoy',
  ],
  'education/skills': [
    'TypeScript generics — tutorial completo con ejemplos reales',
    'Design patterns que uso todos los días',
    'Clean code en TypeScript — refactoring en vivo',
    'Cómo prepararse para entrevistas técnicas en 2025',
  ],
  'entertainment/lifestyle': [
    'Receta fácil: milanesas en 20 minutos',
    'Clase de yoga para principiantes — 10 minutos',
    'Vlog: una semana en Bariloche',
  ],
};

// --- Video ID generator (format: 11 alphanumeric chars) ---
const VIDEO_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function randomVideoId(): string {
  return Array.from({ length: 11 }, () =>
    VIDEO_ID_CHARS[Math.floor(Math.random() * VIDEO_ID_CHARS.length)]
  ).join('');
}

// --- Random timestamp between two dates ---
function randomTimestamp(from: Date, to: Date): string {
  const ms = from.getTime() + Math.random() * (to.getTime() - from.getTime());
  return new Date(ms).toISOString().replace(/(\.\d{3})Z$/, (_, ms) => ms + 'Z');
}

// --- Watch history entry builder ---
// Based on official Google Takeout README schema
interface WatchEntry {
  header: string;
  title: string;
  titleUrl?: string;
  subtitles?: Array<{ name: string; url: string }>;
  time: string;
  products: string[];
  activityControls: string[];
  details?: Array<{ name: string }>;
}

function makeWatchEntry(channel: MockChannel, date: Date): WatchEntry {
  const titles = VIDEO_TITLES[channel.category] ?? VIDEO_TITLES['tech/hardware'];
  const videoTitle = titles[Math.floor(Math.random() * titles.length)];
  const videoId = randomVideoId();

  return {
    header: 'YouTube',
    title: `Watched ${videoTitle}`,
    titleUrl: `https://www.youtube.com/watch?v=${videoId}`,
    subtitles: [{ name: channel.name, url: channel.url }],
    time: date.toISOString().replace(/(\.\d{3})Z/, '$1Z'),
    products: ['YouTube'],
    activityControls: ['YouTube watch history'],
  };
}

// Some entries don't have subtitles (deleted videos, ads) — per official docs
function makeOrphanEntry(date: Date): WatchEntry {
  return {
    header: 'YouTube',
    title: 'Watched a video that has been deleted or made private',
    time: date.toISOString().replace(/(\.\d{3})Z/, '$1Z'),
    products: ['YouTube'],
    activityControls: ['YouTube watch history'],
    // No titleUrl, no subtitles — valid per spec
  };
}

// --- Main generation ---
const START = new Date('2024-01-01T00:00:00.000Z');
const END   = new Date('2025-11-30T23:59:59.000Z');

const entries: WatchEntry[] = [];

for (const channel of CHANNELS) {
  for (let i = 0; i < channel.watchEvents; i++) {
    // Bias timestamps: more watches in the last 6 months (realistic)
    const biasedStart = i < channel.watchEvents * 0.6
      ? new Date('2025-06-01T00:00:00.000Z')
      : START;
    entries.push(makeWatchEntry(channel, new Date(randomTimestamp(biasedStart, END))));
  }
}

// Add ~15 orphan entries (deleted/private videos, per spec)
for (let i = 0; i < 15; i++) {
  entries.push(makeOrphanEntry(new Date(randomTimestamp(START, END))));
}

// Sort descending by time (most recent first — matches real Takeout order)
entries.sort((a, b) => b.time.localeCompare(a.time));

// --- Write watch-history.json ---
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/watch-history.json', JSON.stringify(entries, null, 2));
console.log(`watch-history.json: ${entries.length} entries`);

// --- Write subscriptions.csv ---
// Official format: Channel Id,Channel Url,Channel Title
// Some Takeout exports include comment lines at the top (handled by ingest parser)
const subscribed = CHANNELS.filter(c => c.isSubscribed);
const csvLines = [
  'Channel Id,Channel Url,Channel Title',
  ...subscribed.map(c => `${c.id},http://www.youtube.com/channel/${c.id},${c.name}`),
];
fs.writeFileSync('data/subscriptions.csv', csvLines.join('\n'));
console.log(`subscriptions.csv: ${subscribed.length} subscriptions`);

// --- Summary ---
console.log('\nMock data summary:');
console.log(`  Channels with watch history: ${CHANNELS.filter(c => c.watchEvents > 0).length}`);
console.log(`  Zombie subscriptions (0 watches): ${CHANNELS.filter(c => c.isSubscribed && c.watchEvents === 0).length}`);
console.log(`  Total watch events: ${CHANNELS.reduce((s, c) => s + c.watchEvents, 0)} + 15 orphans`);
console.log(`  Categories covered: ${[...new Set(CHANNELS.map(c => c.category))].join(', ')}`);
