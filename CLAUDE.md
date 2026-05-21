# CLAUDE.md — youtube-mirror

## Contexto del proyecto

Este proyecto analiza el consumo real de YouTube usando datos de Google Takeout + YouTube Data API. El objetivo es romper cámaras de eco y auditar suscripciones con datos honestos, sin el sesgo del algoritmo.

**Stack:** TypeScript / Node.js 20+, YouTube Data API v3.
**Clasificación:** realizada por el agente de IA del usuario (Claude Code, Copilot, Gemini, Codex, etc.) — no requiere billing de API adicional.

---

## Estructura de datos

```
data/                    # Takeout exports — gitignored, nunca commitear
  watch-history.json
  subscriptions.csv

output/                  # Resultados — gitignored
  channels.json          # Canales enriquecidos y clasificados (fuente de verdad)
  to_classify.md         # Lista generada para que el agente clasifique
  classifications.json   # Output del agente, antes de aplicar
  report.md              # Reporte final de consumo
  audit.json             # Auditoría de suscripciones
```

---

## Pipeline completo

### Paso 1 — Ingest (automático)
```bash
npm run ingest
```
Parsea `watch-history.json` y `subscriptions.csv`. Genera `output/channels.json` con todos los canales únicos y su frecuencia de vistas.

### Paso 2 — Enrich (automático)
```bash
npm run enrich
```
Para cada canal llama YouTube Data API: nombre, descripción, suscriptores, y duración promedio de los últimos 10 videos para clasificar el formato.

**Regla de formato:**
- Promedio < 3 min → `shorts-first`
- Promedio > 8 min → `long-form`
- Entre 3-8 min → `mixed`

### Paso 2b — Enrich videos (opcional, mejora el reporte)
```bash
npm run events          # primero: genera output/events.json
npm run enrich:videos   # luego: fetchea duraciones reales por video
```
Lee `output/events.json`, extrae todos los video IDs únicos, llama `videos.list?part=contentDetails` en batches de 50.
Escribe `output/video-durations.json`: `{ [videoId]: durationSeconds | null }`.

- `null` = video eliminado/privado (ya consultado, no se vuelve a consultar)
- Ausencia de clave = nunca consultado
- **Idempotente**: re-runs solo fetchean IDs nuevos
- **Costo quota**: ~1 unit por batch de 50 → ~900 units para 44k eventos → muy por debajo del límite de 10.000/día
- `html.ts` escribe automáticamente `output/durations.js` si el JSON existe
- El modal muestra duración real cuando está disponible, con `~` y tooltip cuando es estimado (promedio del canal)

### Paso 3 — Classify (agentico — rol del asistente de IA)
```bash
npm run classify:prepare   # genera output/to_classify.md
```
Luego el agente lee `output/to_classify.md` y clasifica cada canal según la taxonomía de abajo.
El agente guarda el resultado en `output/classifications.json`.
```bash
npm run classify:apply     # aplica las clasificaciones a channels.json
```

### Paso 4 — Report (automático)
```bash
npm run report
```
Genera `output/report.md` con métricas de consumo, diversidad y auditoría de suscripciones.

---

## Taxonomía de categorías

Categorías válidas. Asignar una primaria obligatoria y una secundaria si aplica:

**Política**
- `politics/argentina` — política, economía y actualidad argentina (Milei, kirchnerismo, Congreso, economía nacional)
- `politics/geopolitics` — geopolítica, conflictos y noticias internacionales (Ucrania, Israel, Venezuela, EEUU)
- `opinion/economics` — macroeconomía, negocios, libertarismo y finanzas (no Argentina-specific)

**Deportes**
- `sports/f1` — Fórmula 1, WEC y motorsport real (análisis, carreras, pilotos)
- `sports/simracing` — simuladores de carreras: iRacing, Le Mans Ultimate, Assetto Corsa
- `sports/general` — fútbol y otros deportes

**Tecnología**
- `gaming` — videojuegos: gameplays, análisis, noticias de juegos, esports
- `tech/hardware` — hardware, PCs, smartphones, electrónica, impresión 3D
- `tech/software` — programación, IA/ML, devtools, ciberseguridad

**Ciencia**
- `science` — divulgación científica, física, química, ingeniería, aeronáutica, medicina, biología

**Entretenimiento**
- `entertainment/humor` — humor, memes, clips virales, shitposting, compilaciones
- `entertainment/mystery` — misterio, crimen, hechos perturbadores, horror, curiosidades históricas virales
- `entertainment/podcast` — podcasts y talk shows de entrevistas/debate sin temática específica
- `entertainment/lifestyle` — lifestyle, cocina, viajes, vida nocturna, veterinaria, vlogs

**Hobbies**
- `hobby/lego` — LEGO: construcciones, sets, MOCs, reviews de sets
- `hobby/diy` — manualidades, DIY, reparaciones, jardinería, coleccionismo

**Educación**
- `education/history` — historia, documentales etnográficos, arqueología, cultura

**Sin categoría**
- `uncategorized` — información insuficiente para clasificar

**Notas clave de clasificación:**
- El Escoces gamer: el usuario ve sus videos de curiosidades históricas, NO gaming → `entertainment/mystery`
- Canales de streaming político argentino (Carajo, LHDA, Tipito, Neura Media) → `politics/argentina`
- Solo Fonseca, Lupago → `politics/geopolitics` (análisis internacional/militar)
- Simracing (Borja Zazo, Heikki360ES, GITGUD Racing) → `sports/simracing`, NO `sports/general`
- F1 (Sportmaniaticos, David Perogil) → `sports/f1`, NO `sports/general`

---

## Instrucciones de clasificación para el agente

Cuando el usuario pida clasificar canales:

1. Leer `output/to_classify.md`
2. Para cada canal, asignar `categoryPrimary` y opcionalmente `categorySecondary` de la taxonomía de arriba
3. Guardar el resultado en `output/classifications.json` con este formato exacto:

```json
[
  {
    "channelId": "UCxxxxxx",
    "categoryPrimary": "tech/hardware",
    "categorySecondary": "tech/gaming"
  }
]
```

4. Informar al usuario cuántos canales clasificaste y decirle que corra `npm run classify:apply`

**Reglas de clasificación:**
- Basarse en el nombre + descripción del canal, no en supuestos
- Si hay duda entre dos categorías, elegir la más específica
- Si el canal mezcla contenido de forma equilibrada, usar `categorySecondary`
- Nunca inventar categorías fuera de la taxonomía

---

## Consultas frecuentes del usuario

**"Analizá mis canales" / "Corré el análisis"**
1. Verificar que existan `data/watch-history.json` y `data/subscriptions.csv`
2. Guiar al usuario por los 4 pasos del pipeline en orden
3. Ofrecer clasificar en el paso 3

**"¿Cuáles son mis canales más vistos?"**
Leer `output/channels.json`, ordenar por `watchCount` desc, mostrar top 10 con categoría y formato.

**"¿Tengo cámara de eco?"**
Agrupar por `categoryPrimary`, calcular % de vistas por categoría. Si alguna supera el 60%, o si `news/argentina` + `opinion/` suman más del 50%, alertar con los datos.

**"¿Qué suscripciones puedo borrar?"**
Filtrar `channels.json` donde `isSubscribed: true` y (`watchCount: 0` o `lastWatched` < 90 días atrás). Separar entre shorts-first y long-form.

**"¿Qué porcentaje de mi consumo es X?"**
Agrupar `channels.json` por `categoryPrimary`, calcular % sobre suma total de `watchCount`.

**"Clasificá mis canales"**
Seguir el flujo del Paso 3 arriba.

---

## Reglas generales

- Nunca commitear `data/` ni `output/` — están en `.gitignore`
- No llamar a YouTube API más de lo necesario — los resultados se cachean en `channels.json` (`enrichedAt` indica si ya fue procesado)
- No re-ejecutar el pipeline si `channels.json` tiene menos de 7 días
- Solo usar categorías de la taxonomía definida — nunca las categorías de YouTube

---

## Variables de entorno

```
YOUTUBE_API_KEY=    # YouTube Data API v3 (única API key necesaria)
```

---

## Comandos

```bash
npm run ingest            # Parsea Takeout → output/channels.json
npm run enrich            # Enriquece canales con YouTube API (formato, suscriptores)
npm run events            # Extrae eventos por video → output/events.json (10MB)
npm run enrich:videos     # Duración real por video → output/video-durations.json (opcional)
npm run classify:prepare  # Prepara lista para que el agente clasifique
npm run classify:apply    # Aplica clasificaciones del agente a channels.json
npm run report            # Genera reporte Markdown
npm run report:html       # Genera reporte visual → output/report.html + events.js + durations.js
npm run pipeline          # Corre ingest + enrich + report (classify es manual)
```

**Archivos output y sus dependencias:**
```
output/channels.json        ← ingest → enrich → classify:apply (fuente de verdad)
output/events.json          ← npm run events (desde Takeout, sin API)
output/video-durations.json ← npm run enrich:videos (desde events.json + YouTube API)
output/report.html          ← npm run report:html (desde los tres anteriores)
output/events.js            ← generado por report:html si events.json existe
output/durations.js         ← generado por report:html si video-durations.json existe
```
