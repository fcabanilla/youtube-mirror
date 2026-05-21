import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { db, initDb } from './db.js';
import type { Channel } from '../types.js';

const PORT         = parseInt(process.env.PORT ?? '5151');
const OUTPUT_DIR   = path.resolve('output');
const CHANNELS_FILE = path.resolve('output/channels.json');
const EVENTS_FILE   = path.resolve('output/events.json');

const app = express();
app.use(express.json());
app.use(express.static(OUTPUT_DIR));

// ── Load source data ─────────────────────────────────────────────────────────
function loadChannels(): Channel[] {
  if (!fs.existsSync(CHANNELS_FILE)) return [];
  return JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf-8'));
}

function loadEvents(): Record<string, [string, string, string][]> {
  if (!fs.existsSync(EVENTS_FILE)) return {};
  return JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf-8'));
}

// ── Apply overrides from db to channel list ───────────────────────────────────
function applyOverrides(channels: Channel[]): Channel[] {
  const overrides = db.data!.overrides;
  return channels.map(c => {
    const ov = overrides[c.channelId];
    if (!ov) return c;
    return {
      ...c,
      categoryPrimary:   ov.categoryPrimary,
      categorySecondary: ov.categorySecondary,
      _notes:            ov.notes,
      _overridden:       true,
    };
  });
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/channels — all channels with overrides applied
app.get('/api/channels', (_req, res) => {
  const channels = applyOverrides(loadChannels());
  res.json(channels);
});

// GET /api/channels/:id — single channel with override
app.get('/api/channels/:id', (req, res) => {
  const channels = loadChannels();
  const ch = channels.find(c => c.channelId === req.params.id);
  if (!ch) return res.status(404).json({ error: 'not found' });
  const ov = db.data!.overrides[ch.channelId];
  res.json(ov ? { ...ch, ...ov, _overridden: true } : ch);
});

// PATCH /api/channels/:id — save category override
app.patch('/api/channels/:id', async (req, res) => {
  const { categoryPrimary, categorySecondary, notes } = req.body;
  if (!categoryPrimary) return res.status(400).json({ error: 'categoryPrimary required' });

  const id = req.params.id;
  db.data!.overrides[id] = {
    categoryPrimary,
    categorySecondary: categorySecondary || undefined,
    notes:             notes || undefined,
    updatedAt:         new Date().toISOString(),
  };
  await db.write();
  res.json({ ok: true, id, categoryPrimary, categorySecondary, notes });
});

// DELETE /api/channels/:id/override — remove override, revert to original
app.delete('/api/channels/:id/override', async (req, res) => {
  delete db.data!.overrides[req.params.id];
  await db.write();
  res.json({ ok: true });
});

// GET /api/events/:id — events for a channel
app.get('/api/events/:id', (req, res) => {
  const events = loadEvents();
  res.json(events[req.params.id] ?? []);
});

// GET /api/overrides — all current overrides (for export)
app.get('/api/overrides', (_req, res) => {
  res.json(db.data!.overrides);
});

// GET /api/stats — quick summary
app.get('/api/stats', (_req, res) => {
  const channels = loadChannels();
  const overrides = db.data!.overrides;
  res.json({
    totalChannels:    channels.length,
    totalOverrides:   Object.keys(overrides).length,
    lastUpdated:      Object.values(overrides).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt))[0]?.updatedAt ?? null,
  });
});

// ── Fallback: serve report.html for any non-API route ────────────────────────
app.use((_req, res) => {
  const reportPath = path.join(OUTPUT_DIR, 'report.html');
  if (fs.existsSync(reportPath)) res.sendFile(reportPath);
  else res.status(404).send('Reporte no encontrado. Corré npm run report:html primero.');
});

// ── Start ─────────────────────────────────────────────────────────────────────
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🎬  youtube-mirror server corriendo`);
    console.log(`    http://localhost:${PORT}/report.html\n`);
    console.log(`    API: http://localhost:${PORT}/api/stats`);
    const overrideCount = Object.keys(db.data!.overrides).length;
    if (overrideCount > 0) {
      console.log(`    ${overrideCount} overrides cargados desde output/db.json`);
    }
  });
});
