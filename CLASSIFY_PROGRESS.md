# Clasificación de canales — Estado y contexto

## Resumen ejecutivo

El análisis requiere clasificar **4.233 canales únicos** de YouTube.
El archivo `output/to_classify.md` tiene 38.949 líneas.
Intentamos clasificarlos manualmente como agente IA, pero la tarea agotó el contexto disponible en 3 sesiones.

**Solución implementada:** script `src/classify/auto.ts` con:
- Overrides explícitos para los ~90 canales de mayor watchCount (verificados leyendo el archivo)
- Reglas por keywords (nombre + descripción) para el resto

---

## Estado del pipeline

| Paso | Script | Estado |
|------|--------|--------|
| 1. Ingest | `npm run ingest` | ✅ Completo — 52.906 eventos reales |
| 2. Enrich | `npm run enrich` | ✅ Completo — 4.233 canales enriquecidos con YouTube API |
| 3a. Prepare | `npm run classify:prepare` | ✅ Completo — genera `output/to_classify.md` (38.949 líneas) |
| 3b. Classify | `npm run classify:auto` | ⚡ PENDIENTE — genera `output/classifications.json` |
| 3c. Apply | `npm run classify:apply` | ⚡ PENDIENTE — aplica classifications.json a channels.json |
| 4. Report | `npm run report` | ⚡ PENDIENTE — genera report.md y audit.json |

**Para completar el pipeline:**
```bash
npm run classify:auto
npm run classify:apply
npm run report
```

---

## Historia de sesiones

### Sesión 1 (contexto agotado)
- Leídas líneas 1–~15.000 de `to_classify.md`
- Acumuladas clasificaciones de los canales con watchCount > 50
- Top: Carajo (715), El Escoces gamer (585), Sr Galileo Clips (369)

### Sesión 2 (contexto agotado)
- Leídas líneas ~15.000–29.582
- Cubiertos canales de watchCount 3–50
- Categorías dominantes: entertainment/sports (F1/simracing), tech/gaming, education/science

### Sesión 3 (esta sesión)
- Leídas líneas 29.582–38.949 (fin del archivo)
- Canales watchCount 0–2 (suscripciones zombie)
- Implementado `src/classify/auto.ts` para resolver el problema de forma durable

---

## Taxonomía de categorías

```
tech/hardware      — PCs, GPUs, impresoras 3D, electrónica
tech/software      — programación, devtools, IA/ML
tech/gaming        — videojuegos, análisis, gameplays

news/argentina     — política y economía argentina
news/international — geopolítica, noticias globales
opinion/economics  — economía, finanzas personales, inversiones
opinion/general    — ensayo, debate, divulgación de ideas

entertainment/humor     — comedia, sketches, absurdo
entertainment/sports    — deportes, análisis deportivo (F1, simracing)
entertainment/lifestyle — vlogs, viajes, gastronomía

education/science  — ciencia, física, biología, matemáticas
education/history  — historia, arqueología, cultura
education/skills   — tutoriales, aprendizaje de habilidades

uncategorized      — información insuficiente para clasificar
```

---

## Top 20 canales por watchCount (verificados manualmente)

| Canal | watchCount | Categoría |
|-------|-----------|-----------|
| Carajo | 715 | news/argentina |
| El Escoces gamer | 585 | tech/gaming |
| Sr Galileo Clips | 369 | entertainment/humor |
| spicy4tuna | 257 | entertainment/humor |
| LHDA PODCAST | 243 | news/argentina |
| Borja Zazo Simracing | 235 | entertainment/sports |
| Zack D. Films | 173 | entertainment/humor |
| DaniRep | 159 | tech/gaming |
| Breaking Vlad | 155 | education/science |
| MedHouse | 152 | education/science |
| Heikki360ES | 148 | entertainment/sports |
| The Lawn Tools | 140 | education/skills |
| Miguel ASSAL | 140 | education/skills |
| Sportmaniaticos.com | 136 | entertainment/sports |
| Lupago | 130 | entertainment/humor |
| La Formula de DAVID PEROGIL | 130 | entertainment/sports |
| Neura Media | 129 | opinion/general |
| Master Builder Alec | 127 | education/skills |
| Juan Ramón Rallo | 112 | opinion/economics |
| Solo Fonseca | 109 | news/international |

---

## Perfil de consumo detectado (preliminar)

Basado en la lectura completa del archivo, el usuario consume principalmente:

1. **Entretenimiento/deportes** — F1 y simracing es la categoría más grande por cantidad de canales activos
2. **Humor** — clips, streamers, shorts de humor argentino y español  
3. **Noticias argentina** — fuerte sesgo libertario/liberal (Carajo, LHDA, Tipito, Break Point)
4. **Educación ciencias** — química, aeroespacial, divulgación
5. **Tech gaming** — principalmente EFT/Tarkov, GTA, FPS
6. **Suscripciones zombie** — >3.000 canales con watchCount=0 que nunca se vieron

**Advertencia de cámara de eco:** `news/argentina` + `opinion/general` probablemente suman >40% del consumo real. El reporte final mostrará los números exactos.

---

## Notas técnicas

- `to_classify.md` ordena canales por watchCount desc
- `channels.json` tiene el mismo orden
- `auto.ts` usa IDs para los overrides → matching exacto
- Keyword matching sobre `channelName` + `description`
- Canales de música/Topic → `uncategorized` automáticamente
- Fallback: `uncategorized` si ninguna keyword matchea

---

## Cómo mejorar la clasificación

Si el reporte muestra categorías inesperadas, editar `src/classify/auto.ts`:
1. Agregar el channelId al objeto `OVERRIDES` con la categoría correcta
2. O ajustar los regexes en `scoreChannel()`
3. Correr `npm run classify:auto && npm run classify:apply && npm run report`
