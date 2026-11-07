# FigureWalk

An accessible single-series data explorer: CSV → column mapping → overview → sonification.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the local URL printed in your terminal. `npm run build` creates the production build.

## First walkthrough

Choose **Try a sample**, keep City / Rainfall selected, and choose **Explore with sound**. Select points using Tab and left/right arrows. Enter plays a point. Escape stops sound and speech. Turn on Voice guidance for spoken page introductions. Read overview speaks count, highest, and lowest values.

## Current scope

- Four screens, responsive layout, visible focus, heading focus on navigation.
- Local CSV parsing with Papa Parse; rejects missing labels, blank values, and non-finite numbers.
- Counts/min/max, simple chart, Web Audio pitch mapping, sequence and single-note playback.
- Browser speech synthesis; no API key needed and no Tinker credits consumed yet.
- CSV only. XLSX, external TTS, AI explanations, and Creator mode are not implemented.
- High contrast is an initial visual control; full VoiceOver/NVDA, contrast, and audio testing are still required before claiming accessibility compliance.

## Team integration

The initial prototype is in `src/main.js`, styled in `src/style.css`. Temporary audio and speech implementations should be replaced by teammates' modules.

Shared dataset shape:

```json
{
  "title": "Rainfall by City",
  "xAxis": "City",
  "yAxis": "Rainfall",
  "unit": "mm",
  "data": [{ "label": "Seattle", "value": 95 }]
}
```

Target module contracts:

- Data: `parseFile(file)`, `mapColumns(rows, x, y)`, `getSummary(dataset)`.
- Audio: `playSequence(dataset)`, `playNote(point, dataset)`, `stopAudio()`.
- Voice: `speak(text)`, `stopSpeech()`.

Current local helpers have prototype-specific signatures; agree on the target contracts before swapping modules. Keep statistics deterministic; future AI explanations should use validated data and run through a server-side integration. Never put API keys in browser code.
