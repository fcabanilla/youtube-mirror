# HANDOFF — youtube-mirror

Contexto completo para continuar el desarrollo desde VS Code / Copilot.
Generado el 2026-05-21 desde una sesión con Claude Code.

---

## Qué es este proyecto

Pipeline TypeScript/Node.js que analiza el consumo real de YouTube a partir de Google Takeout.
El objetivo es auditar qué consumís realmente, romper cámaras de eco y reclasificar canales.

**Stack:** TypeScript, Node.js 22, Express v5, lowdb, Chart.js (inlineado), tsx.

---

## Estado actual — qué está hecho

### Pipeline de datos
| Script | Qué hace | Output |
|---|---|---|
| `npm run ingest` | Parsea Takeout JSON/HTML → canales únicos | `output/channels.json` |
| `npm run events` | Extrae eventos por video | `output/events.json` |
| `npm run enrich` | YouTube API: suscriptores, formato | `output/channels.json` (enriquecido) |
| `npm run enrich:videos` | YouTube API: duración real por video | `output/video-durations.json` |
| `npm run enrich:live` | YouTube API: detecta live streams | `output/video-live.json` |
| `npm run classify:prepare` | Genera lista para clasificar | `output/to_classify.md` |
| `npm run classify:apply` | Aplica clasificaciones | `output/channels.json` |
| `npm run report:html` | Genera reporte visual | `output/report.html` |
| `npm run serve` | Servidor Express con API REST | http://localhost:5151 |

### Datos reales cargados
- **52.906 eventos** de historial de YouTube (Google Takeout)
- **23.651 canales** únicos en `output/channels.json`
- **43.776 videos** con duración real (desde YouTube API)
- **812 live streams** detectados

### Reporte visual (`output/report.html`)
- Generado con `npm run report:html`, servido en `http://localhost:5151/report.html`
- Embebe ~22.818 canales en JS inline
- Features:
  - Cards de canales con horas reales de video (suma directa, sin promedios)
  - Filtros: por categoría padre, formato (shorts/largo/mixto), búsqueda por nombre
  - Sort chips: horas, vistas, alfabético, último visto, categoría, formato
  - Barrita de progreso dinámica (refleja el criterio de sort activo)
  - Gráfico de torta dinámico (Chart.js) agrupado por categoría padre
  - Modal por canal: lista de videos con duración real, badge de live/short
  - **Panel de reclasificación** en el modal (requiere servidor activo)

### Servidor API (`src/server/`)
- `src/server/index.ts` — Express v5 en puerto 5151
- `src/server/db.ts` — lowdb con JSONFile en `output/db.json`
- Endpoints:
  - `GET /api/stats` — resumen rápido
  - `GET /api/channels` — todos los canales con overrides aplicados
  - `GET /api/channels/:id` — canal individual
  - `PATCH /api/channels/:id` — guardar override de categoría
  - `DELETE /api/channels/:id/override` — revertir al original
  - `GET /api/overrides` — todos los overrides (para export)
- Al cargar la página, el browser fetchea `/api/overrides` y aplica en memoria → persistencia real al refrescar

---

## Taxonomía de categorías (v3)

Definida en `src/report/html.ts` como objeto `TAXONOMY` (fuente única de verdad).
Los slugs tienen formato `parent/subcategoria` (ej: `deportes/simracing`).

| Padre | Slug | Color | Subcategorías |
|---|---|---|---|
| Actualidad y Política | `actualidad` | `#e63946` | argentina, economia, geopolitica, politica |
| Arte y Entretenimiento | `arte` | `#8b5cf6` | animacion, cine, cultura_pop, humor, lifestyle, misterio, musica, podcast, teatro |
| Ciencias | `ciencias` | `#06b6d4` | astronomia, aviacion, biologia, fisica, geografia, ingenieria, matematicas, medicina, psicologia |
| Deportes | `deportes` | `#16a34a` | acuaticos, artes_marciales, atletismo, automovilismo, ciclismo, esports, futbol, general, golf, invierno, rugby, simracing, tenis |
| Educación | `educacion` | `#84cc16` | filosofia, historia, humanidades, idiomas, literatura |
| Hobbies e Intereses | `hobbies` | `#f97316` | arte, bricolaje, coleccionismo, fotografia, jardin, juegos_mesa, lego, musica_inst |
| Estilo de Vida | `lifestyle` | `#ec4899` | cocina, mascotas, moda, salud, viajes |
| Negocios y Economía | `negocios` | `#eab308` | emprendimiento, global, inversion, libertarismo, marketing |
| Tecnología | `tech` | `#3b82f6` | ciberseguridad, gadgets, hardware, ia, impresion3d, programacion, smartphones, videojuegos, web |
| Sin clasificar | `uncategorized` | `#6b7280` | — |

**Regla de colores:** todos los slugs `parent/sub` heredan el color del padre.
**Fuente:** `TAXONOMY` en `src/report/html.ts` → `CAT_LABELS` y `CAT_COLORS` se derivan automáticamente.

---

## Archivos clave

```
src/
  report/
    html.ts          ← reporte visual completo (~1900 líneas), TODO el frontend está acá
    index.ts         ← genera report.md (texto plano)
  server/
    index.ts         ← Express v5 API
    db.ts            ← lowdb schema y helpers
  ingest/
    index.ts         ← parsea Takeout
    build-events.ts  ← genera events.json
  enrich/
    index.ts         ← enrich canales con YouTube API
    video-durations.ts ← duración real por video
    video-live.ts    ← detecta live streams
  classify/
    prepare.ts       ← genera to_classify.md
    apply.ts         ← aplica classifications.json

scripts/
  migrate-categories-v3.ts  ← migración de slugs de taxonomía (ya ejecutada)
  migrate-categories.ts     ← migración anterior (ya ejecutada)

output/              ← gitignored
  channels.json      ← fuente de verdad (23.651 canales)
  events.json        ← historial por canal (10MB)
  video-durations.json ← duraciones reales (43.776 videos)
  video-live.json    ← flags de live streams
  db.json            ← overrides de categorías (lowdb)
  report.html        ← reporte generado
  events.js          ← companion JS (generado por report:html)
  durations.js       ← companion JS (generado por report:html)
  live.js            ← companion JS (generado por report:html)
```

---

## Estructura de datos

### `channels.json` (por canal)
```json
{
  "channelId": "UCxxxxxx",
  "channelName": "Nombre",
  "channelUrl": "https://...",
  "watchCount": 715,
  "lastWatched": "2026-05-20T23:39:37Z",
  "firstWatched": "2025-01-14T03:08:58Z",
  "isSubscribed": true,
  "description": "...",
  "subscriberCount": 336000,
  "avgDurationSeconds": 4369,
  "format": "long-form",
  "enrichedAt": "...",
  "categoryPrimary": "actualidad/argentina",
  "categorySecondary": null,
  "classifiedAt": "..."
}
```

### `events.json`
```json
{
  "UCxxxxxx": [
    ["Título del video", "https://youtube.com/watch?v=xxx", "2026-05-20T..."],
    ...
  ]
}
```
Máximo 60 eventos por canal, ordenados de más reciente a más antiguo.

### `video-durations.json`
```json
{ "videoId": 180, "videoId2": null }
```
`null` = video eliminado/privado. Ausencia = nunca consultado.

### `db.json` (overrides del servidor)
```json
{
  "overrides": {
    "UCxxxxxx": {
      "categoryPrimary": "deportes/simracing",
      "categorySecondary": "tech/videojuegos",
      "notes": "canal de iRacing",
      "updatedAt": "2026-05-21T..."
    }
  }
}
```

### `ALL_CH` (array embebido en el HTML, índices fijos)
```
[name, url, category, views, isSubscribed, lastWatched, avgDurationSec, format, channelId, realSumSec]
  [0]  [1]    [2]      [3]      [4]            [5]           [6]          [7]      [8]         [9]
```
`realSumSec` = suma directa de duraciones reales de videos con duración conocida (sin promedios, nulls skipped).

---

## Panel de reclasificación (modal)

Visible solo si el servidor está corriendo (`npm run serve`).
El frontend detecta el servidor via `fetch('/api/stats')`.

UI con tres comboboxes searchables (clase `Combobox` en el browser JS):
1. **Categoría padre** → filtra los 9 padres mientras escribís
2. **Subcategoría** → se puebla dinámicamente según el padre elegido
3. **También relacionado con** → opcional, muestra `Padre › Sub`

Al guardar, hace `PATCH /api/channels/:id` y:
- Actualiza `output/db.json` (persistencia)
- Actualiza `ALL_CH[i][2]` en memoria
- Llama `render()` para refrescar la lista

Al cargar la página, `fetch('/api/overrides')` aplica todos los overrides sobre `ALL_CH` antes del primer render.

---

## Ideas / próximos pasos posibles

- [ ] **Exportar overrides como `classifications.json`** para poder correr `classify:apply` y que queden en `channels.json` permanentemente (hoy los overrides solo viven en `db.json`)
- [ ] **Clasificación masiva por AI**: tomar los `uncategorized` y clasificarlos automáticamente con el contexto de título/descripción
- [ ] **Scraper de myactivity.google.com** para historia pre-2025 (datos que no están en Takeout) — vía Chrome MCP
- [ ] **Filtro por rango de fechas** en el reporte
- [ ] **Vista de categoría expandida**: al clickear una categoría en el chart, ver breakdown por subcategoría
- [ ] **Estadísticas por período** (últimos 30/90/365 días)
- [ ] **Export del reporte** como PDF o CSV
- [ ] **Dark/light mode toggle**

---

## Variables de entorno

```
YOUTUBE_API_KEY=    # YouTube Data API v3 (en .env, gitignored)
PORT=5151           # opcional, default 5151
```

---

## Cómo arrancar

```bash
npm install
npm run serve          # servidor en :5151
# abrir http://localhost:5151/report.html
# si querés regenerar el reporte:
npm run report:html
```
