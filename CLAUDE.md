# CLAUDE.md — youtube-mirror

## Contexto del proyecto

Este proyecto analiza el consumo real de YouTube de su dueño usando datos de Google Takeout + YouTube Data API + Claude API. El objetivo es romper cámaras de eco y auditar suscripciones con datos honestos, no el feed sesgado de YouTube.

**Stack:** TypeScript / Node.js 20+, YouTube Data API v3, Anthropic SDK.

---

## Estructura de datos

```
data/                  # Takeout exports (nunca tocar, nunca commitear)
  watch-history.json   # Historial de vistas
  subscriptions.csv    # Lista de suscripciones

output/                # Resultados del pipeline (gitignored)
  channels.json        # Canales enriquecidos y clasificados
  report.md            # Último reporte generado
  audit.json           # Auditoría de suscripciones
```

---

## Pipeline — pasos en orden

### 1. Ingest (`src/ingest/`)
Parsea `data/watch-history.json` y `data/subscriptions.csv`.
Output: lista normalizada de canales con frecuencia de vistas.

### 2. Enrich (`src/enrich/`)
Para cada canal único, llama YouTube Data API:
- Nombre, descripción, cantidad de suscriptores
- Duración promedio de los últimos 10 videos → determina si es Shorts-first / Long-form / Mixto

**Regla de clasificación de formato:**
- Promedio < 3 min → `shorts-first`
- Promedio > 8 min → `long-form`
- Entre 3-8 min → `mixed`

### 3. Classify (`src/classify/`)
Llama Claude API para clasificar cada canal en la taxonomía de categorías del proyecto.
Input: nombre + descripción del canal.
Output: categoría primaria + categoría secundaria (opcional) + confianza.

### 4. Report (`src/report/`)
Genera `output/report.md` y `output/audit.json` con métricas de consumo, diversidad y auditoría de suscripciones.

---

## Taxonomía de categorías

Estas son las categorías válidas para clasificación. Claude debe asignar una primaria y, si aplica, una secundaria:

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
- `uncategorized` — cuando no hay información suficiente para clasificar

---

## Reglas para el agente

### Cuándo ejecutar el pipeline completo
Si el usuario pide "analizá", "corré el análisis", "actualizá los datos" o similar:
1. Verificar que existan `data/watch-history.json` y `data/subscriptions.csv`
2. Ejecutar los pasos en orden: ingest → enrich → classify → report
3. Informar cuántos canales se procesaron y si hubo errores de API

### Cuándo leer los outputs sin re-ejecutar
Para preguntas sobre datos ya procesados, leer directamente `output/channels.json` o `output/report.md`. No re-ejecutar el pipeline si los datos son recientes (menos de 7 días).

### Preguntas frecuentes del usuario y cómo responderlas

**"¿Cuáles son mis canales más vistos?"**
→ Leer `output/channels.json`, ordenar por `watchCount` desc, mostrar top 10 con categoría y formato.

**"¿Tengo cámara de eco?"**
→ Calcular % de watch time por categoría. Si una categoría supera 60%, o si `news/argentina` u `opinion/` tienen >40% del total, marcar como posible cámara de eco y explicar con datos.

**"¿Qué suscripciones puedo borrar?"**
→ Leer `output/audit.json`. Mostrar canales con `watchCount: 0` o `lastWatched` > 90 días. Separar por formato (shorts-first vs long-form).

**"¿Qué porcentaje de mi consumo es X?"**
→ Agrupar `output/channels.json` por categoría, calcular % sobre total de vistas.

**"Recomendame canales"**
→ Identificar categorías subrepresentadas (< 5% del consumo), sugerir búsqueda en YouTube o preguntar al usuario qué temas le interesan explorar.

### Qué NO hacer
- No commitear nada de `data/` ni `output/` — están en `.gitignore`
- No llamar a YouTube API más de lo necesario — cachear resultados en `output/channels.json`
- No inventar datos si el pipeline no se ejecutó — pedir al usuario que provea los archivos de Takeout
- No clasificar con las categorías de YouTube — usar exclusivamente la taxonomía definida arriba

---

## Variables de entorno requeridas

```
YOUTUBE_API_KEY=      # YouTube Data API v3
ANTHROPIC_API_KEY=    # Para clasificación con Claude
```

---

## Comandos disponibles

```bash
npm run ingest      # Parsea Takeout y genera lista de canales únicos
npm run enrich      # Enriquece con YouTube API
npm run classify    # Clasifica con Claude API
npm run report      # Genera reporte final
npm run pipeline    # Corre los 4 pasos en orden
```
