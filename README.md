# FigureWalk

An accessible single-series data explorer: CSV/XLSX → mapping → explicit exploration range → overview and sound. All generated UI and speech are English; uploaded labels are preserved.

## Run and verify

Node.js 20.19+ or 22.12+ is required.

```sh
npm install
npm run dev
npm test
npm run build
# Install Playwright Chromium once, or set FIGUREWALK_CHROME_PATH to a local Chrome executable.
npx playwright install chromium
npm run test:browser
```

Browser tests normally start Vite on port 5188. `FIGUREWALK_TEST_URL` can target an already running server. They instrument audio and speech to verify scheduling, cancellation and English language selection; they do not validate physical speaker output or speech quality.

## Walkthrough and mapping rules

Choose **Try a sample**, select the unit (or **No unit**), then **Validate mapping and continue**. CSV and XLSX files are processed locally. For workbooks with several worksheets, explicitly select one. The original worksheet matrices remain in `state.sheets`; previews and mapped datasets are separate objects.

- Category or time and numeric columns must differ, except Count needs no numeric column.
- **Decimal places** selects 0–10 digits (default 2) for Explorer values and speech. Count uses whole numbers. This rounds presentation only; raw values, aggregation, extrema selection, bar heights and sound retain full precision. Changing precision clears derived results and cancels sound/speech like other mapping changes.
- Unit is required unless No unit is explicitly checked. Count always uses `records`.
- Default is Do not aggregate. Duplicate categories block this mode and require an explicit Sum, Average or Count choice.
- Aggregation follows first category appearance. Dates retain source order and are never grouped implicitly. Excel date cells are represented as ISO timestamps; CSV date labels remain literal strings.
- Blank categories and blank, non-numeric or non-finite numeric cells block conversion, with source row numbers (header is row 1). Zero and negative numbers are valid. Empty records inside a CSV are validated, not silently dropped.
- Numeric recommendations exclude identifier, version, code, postal and date/time fields. Every column remains available for manual selection. Recommendations are only a convenience, not semantic detection.
- More than 100 mapped points require explicit inclusive start/end indices, selecting 1–100 continuous points. Nothing is truncated automatically. Statistics, chart, overview, point playback and sequence all consume the same selected dataset, visibly marked when partial.
- Mapping and worksheet changes cancel audio/speech and clear derived results and range. Range edits cancel audio/speech and clear the previously selected dataset.

Tab accesses all controls. Point controls support left/right, Home/End and Enter. Escape and Stop cancel sound and speech. Read overview speaks the selected range, aggregation, count, highest and lowest. Speech utterances explicitly use `en-US`.

## Modules and integration

`src/import-data.js` exports:

- `parseFile(file)` → Promise of `[{ name, table }]` (CSV or XLSX). File needs `name`, `text()` for CSV, and `arrayBuffer()` for XLSX.
- `parseCSV(text)` → raw cell matrix.
- `prepareTable(table)` → `{ fields, rows }`, without mutating the source matrix. Requires unique, non-empty headers.

`src/mapping.js` exports:

- `numericCell(value)` → `{ value }` or `{ error }`.
- `recommendValue(fields, rows, category)` → column name or empty string.
- `mapColumns(rows, { x, y, aggregation, unit, noUnit, title, sheet, decimalPlaces })` → complete validated dataset. Aggregation is `none` (default), `sum`, `mean` or `count`.
- `selectRange(dataset, start, end)` → compatible dataset containing only the chosen points. Indices are inclusive and start at 1. Rejects invalid ranges or more than 100 points.
- `rangeDescription(dataset)` → English exploration scope text.

Explorer/module output example:

```json
{
  "title": "Rainfall by City",
  "xAxis": "City",
  "yAxis": "Rainfall",
  "unit": "mm",
  "data": [{ "label": "Seattle", "value": 95 }],
  "aggregation": "sum",
  "decimalPlaces": 2,
  "importedRows": 120,
  "totalPoints": 80,
  "sheet": "Sheet1",
  "range": { "start": 1, "end": 1, "total": 80, "partial": true }
}
```

`title`, `xAxis`, `yAxis`, `unit`, and `data: [{label,value}]` remain compatible. `totalPoints` is the full mapped count before range selection. `range` exists on `selectRange()` results. `decimalPlaces` carries the display precision through range selection; `src/format-value.js` exports `formatValue(value, dataset)` for consistent English presentation. Count sets `yAxis: "Record count"` and `unit: "records"`; explicit No unit yields `unit: ""`.

The UI and existing Web Audio/browser speech flow are in `src/main.js`; styling uses plain CSS. No backend, AI calls, database or multi-series support is added. Full VoiceOver/NVDA testing and physical audio listening are still needed before claiming accessibility compliance or audio quality.

## Excel dependency provenance

`read-excel-file@9.3.14` was installed from the official npm registry. Its package metadata links to the author's [GitLab repository](https://gitlab.com/catamphetamine/read-excel-file); the [official documentation](https://github.com/catamphetamine/read-excel-file#readme) documents the universal API used here. Registry metadata checked on 2026-11-07 reports modification on 2026-10-29 and tarball `https://registry.npmjs.org/read-excel-file/-/read-excel-file-9.3.14.tgz`. `package-lock.json` records the resolved URL and integrity. The legacy npm `xlsx` package is not used.

## Verification performed (2026-11-07)

- `npm test`: 6 conversion tests passed, including the committed three-sheet XLSX fixture.
- Chrome/Playwright: 6 tests passed, covering CSV upload, XLSX worksheet choice, aggregation, invalid row messages, range selection (100 accepted, 101 rejected), keyboard navigation, sequence cancellation, `en-US` speech calls, a real Web Audio context/oscillator smoke test, and decimal precision across chart, extrema, selected point and speech.
- `npm run build` and `git diff --check`: passed.
- Physical listening and VoiceOver/NVDA evaluation were not performed.
