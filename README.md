# youtube-mirror

Un agente de análisis de consumo de YouTube que te devuelve un reflejo real de tus hábitos, libre del sesgo del algoritmo de recomendación.

## ¿Qué problema resuelve?

YouTube optimiza para engagement, no para tu crecimiento. El resultado: cámaras de eco, suscripciones acumuladas que nunca ves, y un feed dominado por Shorts que te atraparon un momento. **youtube-mirror** toma tus datos reales (Google Takeout) y los analiza con Claude para darte un mapa honesto de tu consumo.

## ¿Qué hace?

- **Ingesta** tu historial de vistas y suscripciones desde Google Takeout
- **Enriquece** los datos con YouTube Data API (stats de canales, duración promedio de videos)
- **Clasifica** canales con Claude API usando una taxonomía tuya, no la de YouTube
- **Detecta** concentración de consumo y posibles cámaras de eco
- **Audita** suscripciones: activas vs zombies, long-form vs shorts-first vs mixto
- **Reporta** conversacionalmente — preguntás, el agente responde sobre tus datos

## Arquitectura

```
Google Takeout (watch-history.json, subscriptions.csv)
        ↓
[src/ingest]  → parsea y normaliza los datos crudos
        ↓
[src/enrich]  → YouTube Data API v3 → stats de canales y videos
        ↓
[src/classify] → Claude API → categorías semánticas personalizadas
        ↓
[output/]     → JSON estructurado que el agente lee y razona
        ↓
Agente en VS Code (Claude Code) → interfaz conversacional
```

## Estructura del proyecto

```
youtube-mirror/
├── data/               # Takeout exports — gitignored, nunca commitear
│   ├── watch-history.json
│   └── subscriptions.csv
├── src/
│   ├── ingest/         # Parsing y normalización de Takeout
│   ├── enrich/         # Enriquecimiento via YouTube API
│   ├── classify/       # Clasificación semántica via Claude API
│   └── report/         # Generación de reportes y summaries
├── output/             # Resultados del análisis — gitignored
├── .env.example        # Variables de entorno requeridas
├── CLAUDE.md           # Alineación y workflow del agente
└── README.md
```

## Requisitos

- Node.js 20+
- Una [YouTube Data API v3 key](https://console.cloud.google.com/) (cuota gratuita es suficiente)
- Una [Anthropic API key](https://console.anthropic.com/) para la clasificación con Claude
- Export de Google Takeout con los datos de YouTube

## Cómo obtener tus datos (Google Takeout)

1. Ir a [myaccount.google.com/data-and-privacy](https://myaccount.google.com/data-and-privacy)
2. → "Descargar tus datos" → seleccionar solo **YouTube e YouTube Music**
3. Formato: JSON. Descargar y extraer en `data/`
4. Los archivos relevantes son `watch-history.json` y `subscriptions.csv`

## Setup

```bash
npm install
cp .env.example .env
# Completar YOUTUBE_API_KEY y ANTHROPIC_API_KEY en .env
```

## Uso con el agente

Abrí este proyecto en VS Code con Claude Code activo. El agente conoce el workflow completo (ver `CLAUDE.md`) y puede responder preguntas como:

- "Analizá mis suscripciones"
- "¿Qué porcentaje de mi consumo es contenido político?"
- "¿Cuáles son los canales de Shorts a los que me suscribí pero nunca veo?"
- "Mostrame los 10 canales que más miro"
- "¿Tengo alguna cámara de eco?"
