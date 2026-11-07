# ChartAloud Studio

A local-first single-series CSV/XLSX chart learning tool. Creator Mode prepares
and publishes learning materials; User Mode opens prepared charts without mapping
or uploading spreadsheets. Generated UI, errors and exact-value speech are English;
imported labels are preserved. The blue/peach stationery style and supplied brand
artwork are retained.

On the Explorer screen, the local AI advisor automatically selects a music preset
and pitch mapping from numeric summary statistics. ChartAloud's recorded-instrument
engine plays the music after the user presses **Play as music**. The compact sound
panel appears near the top; **Adjust music** exposes manual choices and an optional
explanation. The AI does not generate audio or receive raw rows, labels, or files.

## Run and verify

Node.js 20.19+ or 22.12+ is required.

```sh
npm ci
npm run dev
npm test
npm run build
# Install once, or point FIGUREWALK_CHROME_PATH to an installed Chrome binary.
npx playwright install chromium
npm run test:browser
```

Open the local URL printed by Vite. Browser tests normally use port 5188.
`FIGUREWALK_TEST_URL` can target an existing server. For installed macOS Chrome:

```sh
FIGUREWALK_TEST_URL=http://127.0.0.1:5176 \
FIGUREWALK_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
npm run test:browser
```

### Local AI setup

Copy `.env.example` to `.env.local`, choose `AI_PROVIDER=tinker` or
`AI_PROVIDER=gemini`, and enter the matching API key and model. For Tinker, use
the full sampler checkpoint path in `TINKER_MODEL_PATH`. Restart Vite after
changing `.env.local`. The Vite development server handles `/api/sound-map`;
this local endpoint is not included in the static production build.

Without a working AI service, Explorer still plays the standard acoustic sound.
The uploaded CSV/XLSX stays in the browser. The local server computes summary
statistics and sends only those statistics to the chosen provider. API keys stay
on the server and `.env.local` is ignored by Git.

## Creator and learner flows

Home provides real Creator Mode and User Mode buttons. There is no global Space
shortcut and no automatic guidance or playback. AI sound selection starts
automatically when Explorer opens; audio starts only when the user presses Play.

Creator: Import CSV/XLSX → Map → Preview → Publish learning material. Try a sample
is available inside Import. Title is required; description and learning goal are
optional. Preview and Preview as learner share the exact same Explorer used in
User Mode. Review displays the actual metric, axes, unit, aggregation, point count,
range, and calculated extrema. A partial selection is always marked partial data.

Publish validates and writes an independent immutable snapshot. Success is shown
only after the write succeeds. Subsequent edits do not change earlier revisions;
republishing retains the material ID and increments revision. The library retains
all revisions, with explicit open buttons. After successful publication, Start
another material begins a separate material with a new ID on publication.

Mode switching and Back to home preserve the current Creator draft in this tab;
unpublished changes are indicated. Drafts do not survive page reload or tab close.
Published materials persist until browser storage is cleared. There is no account,
database, or cross-device material service. The AI development proxy is stateless.

User: Materials → textual Overview → keyboard/sound Explorer. Users explicitly
choose a material, even when only Sample is available. There is no automatic
sequence or speech. Opening a material stops all previous playback and focuses its
title. Overview includes axes, unit, selected count, highest/lowest values,
aggregation and range. Sample and JSON import remain available in an empty library.

## Storage and JSON handoff

**Saved in this browser** means this browser profile and this origin, including its
port. Materials are not automatically visible on other devices or another port.
The local library uses `localStorage` under `chartaloud.materials.v1`; published
snapshots contain at most 100 selected points, so no spreadsheet binaries need to
be stored. Storage failure or corruption is reported without overwriting existing
storage or discarding the Creator draft. Retry or export JSON to preserve work.

Export published JSON to transfer an actual saved revision. Export draft as
material JSON produces a validated transferable snapshot without claiming it was
published locally. User imports JSON and immediately opens the prepared dataset,
without column mapping. If saving is blocked/full, a valid import can still open
for the current session with an explicit error; keep the original JSON and retry
from Materials. Invalid JSON, unsupported versions, inconsistent counts/ranges,
invalid values, oversized files, and conflicting ID/revision content are rejected.
Repeated identical imports are idempotent. There are no share links.

```json
{
  "schemaVersion": 1,
  "id": "stable-uuid",
  "revision": 1,
  "title": "Rainfall lesson",
  "description": "Compare cities.",
  "learningGoal": "Find the highest value.",
  "createdAt": "2026-11-07T00:00:00.000Z",
  "dataset": {
    "title": "Rainfall by City",
    "xAxis": "City",
    "yAxis": "Rainfall",
    "unit": "mm",
    "data": [{ "label": "Seattle", "value": 95 }],
    "aggregation": "none",
    "decimalPlaces": 2,
    "importedRows": 1,
    "totalPoints": 1,
    "sheet": "CSV",
    "range": { "start": 1, "end": 1, "total": 1, "partial": false }
  }
}
```

JSON imports accept one material, up to 2 MB. Schema version is currently 1.
The validator reconstructs known fields rather than trusting arbitrary properties.
Stable point IDs are `point-<original mapped index>` within the material revision.

## Mapping and data semantics

- CSV/XLSX only, single-series bar charts. No image recognition.
- Blank or repeated headers get distinct display names, and extra data columns
  remain available. The mapping screen shows each adjustment; source files are
  never changed.
- Multi-sheet workbooks require worksheet selection. Source tables remain separate
  from previews and mapped data. No implicit date sorting or grouping.
- Category and numeric columns must differ, except Count requires no numeric column.
- Unit is required unless No unit is explicitly checked. Count uses `records`.
- Duplicate categories require an explicit Sum, Average or Count selection.
  Aggregation follows first category appearance.
- Blank categories and invalid numeric cells report original source row numbers;
  zero and negatives are valid. Empty interior CSV records are not silently dropped.
- Numeric recommendations exclude identifiers, versions, codes, postal and date/time
  fields, but every field remains manually selectable.
- Decimal places (0–10, default 2) controls displayed and spoken values, not raw
  data, aggregation, extrema or pitch. Count always uses whole numbers.
- More than 100 mapped points require an explicit continuous inclusive range of
  1–100 points. No silent truncation. Chart, overview, statistics and audio use
  exactly that range. Partial data never claims to represent the full table.
- Changing mapping or ranges stops all old audio and clears derived results.

## Keyboard, speech and audio

Tab reaches native controls. Use Focus exploration area to focus the chart container:

- Left/Right select a point; Home/End select first/last.
- Enter explicitly reads the current label, displayed numeric value and unit.
- R plays the current pitch; a checkbox can disable this single-letter shortcut.
- Space plays/pauses the sequence only when the exploration container itself has focus.
- Escape stops application audio and value reading without navigation.

Every action has an equivalent button. Point buttons select points using native
click/Enter/Space; shortcuts do not override controls, links, forms, contenteditable,
modifier combinations or repeated keydown. No `role="application"` is used. Screen
readers can use native buttons when they capture arrow keys. Progress updates change
only the selected-point UI and short status, preserving focus.

`src/playback.js` centrally owns oscillator notes, sequence pause/resume, recorded
music and exact-value speech. Speech cancels music and vice versa. Cancellation
clears timers and invalidates stale asynchronous callbacks. Exact-value speech uses
`en-US` and an available English voice; unsupported/blocked APIs show English status
messages. No speech is needed for exploration, playback or the textual overview.

**Audio Guidance is not implemented.** The header is a non-interactive Coming soon
label. `src/guidance.js` provides an inert event adapter and a stop/cancel boundary;
it never generates speech/scripts, calls APIs, or automatically plays sound.
See [Guidance integration](docs/GUIDANCE_INTEGRATION.md) for event timing, context
shape, cancellation requirements, and the read-only future-agent interface.

## Modules and verification

- `src/import-data.js`: CSV/XLSX parsing and table preparation.
- `src/mapping.js`: validation, aggregation, recommendations and explicit range selection.
- `src/materials.js`: schema validation, immutable snapshots, revisions, Sample and local persistence.
- `src/main.js`: mode flows and a shared Explorer for Creator/User, focus and keyboard behavior.
- `src/playback.js`: centralized cancellation and playback; existing recorded engine remains in
  `src/audioEngine.js`, with arrangements/samples/ambience in their existing modules.
- `src/guidance.js`: deliberately unimplemented integration adapter.

The automated checks cover original import/mapping/range behavior plus immutable
revision publication, Creator-to-User equality, JSON export/import into an independent
browser context, invalid input and failed storage recovery, keyboard controls,
explicit-only speech, cancellation and real Chrome Web Audio. Tests cannot establish
physical audio quality or full VoiceOver/NVDA behavior. Those require manual listening
and assistive-technology testing; do not claim accessibility compliance from automation.
Review screenshots are saved in `artifacts/screenshots/` by the browser suite.

Brand source images remain in `assets/brand-source/`; UI cutouts are in `public/brand/`.
Instrument and ambience attribution remains in [SAMPLE_CREDITS.md](SAMPLE_CREDITS.md).
