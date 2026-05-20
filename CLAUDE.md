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

**Tecnología**
- `tech/hardware` — PCs, GPUs, impresoras 3D, electrónica
- `tech/software` — programación, devtools, IA/ML
- `tech/gaming` — videojuegos, análisis, gameplays

**Información y opinión**
- `news/argentina` — política y economía argentina
- `news/international` — geopolítica, noticias globales
- `opinion/economics` — economía, finanzas personales, inversiones
- `opinion/general` — ensayo, debate, divulgación de ideas

**Entretenimiento**
- `entertainment/humor` — comedia, sketches, absurdo
- `entertainment/sports` — deportes, análisis deportivo
- `entertainment/lifestyle` — vlogs, viajes, gastronomía

**Educación**
- `education/science` — ciencia, física, biología, matemáticas
- `education/history` — historia, arqueología, cultura
- `education/skills` — tutoriales, aprendizaje de habilidades

**Sin categoría**
- `uncategorized` — información insuficiente para clasificar

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
npm run ingest            # Parsea Takeout
npm run enrich            # Enriquece con YouTube API
npm run classify:prepare  # Prepara lista para que el agente clasifique
npm run classify:apply    # Aplica clasificaciones del agente a channels.json
npm run report            # Genera reporte final
npm run pipeline          # Corre ingest + enrich + report (classify es manual)
```
