# ChartAloud Studio

A local-first single-series CSV/XLSX chart learning tool. Creator Mode prepares
and publishes learning materials; User Mode opens prepared charts without mapping
or uploading spreadsheets. Generated UI, errors and exact-value speech are English;
imported labels are preserved. The blue/peach stationery style and supplied brand
artwork are retained.

Creator Preview uses Tinker to recommend a music style and pitch mapping from
numeric summary statistics. **Play as music** plays the selected arrangement.
**Adjust music** allows a personal choice; **Use AI suggestion** appears only
when the current choice differs. **How is the sound chosen?** explains the
mapping. Individual point cues are short notes, rather than the full arrangement.
The AI does not generate audio or receive raw rows, labels, or files.

The floating animated music note opens the ChartAloud Guide on every screen.
It accepts typed questions or English browser speech recognition and answers
through Tinker. Home, User Mode, and opened lessons offer short English spoken
greetings, subject to the browser's autoplay rules. There is no automatic long
data summary; a learner can ask for the overview when ready.
Chart values and assistant replies are synthesized locally with the bundled
Kokoro `af_heart` English voice. The static site includes the quantized model
and ONNX WebAssembly runtime; entering User Explore preloads about 100 MB of same-origin
assets and shows progress, after which the browser caches them. The first
utterance uses the browser voice immediately while Kokoro prepares in the
background; later utterances use Kokoro. Kokoro inference runs in a Web Worker
so model setup and synthesis do not block chart interaction.
Brief greetings use the installed browser voice to avoid loading the model at
page startup. Speech recognition still uses the browser's English `SpeechRecognition` API and requires microphone
permission. If the bundled voice cannot run, speech falls back to the browser's
English voice.
Assistant response time also depends on the configured Tinker model and network.
The server returns `Server-Timing` (`tinker` and total `assistant`) plus
`X-Tinker-Elapsed-Ms` and `X-Assistant-Elapsed-Ms` headers to expose the upstream
wait in browser devtools. Responses are capped at 220 tokens and the upstream
request, including response-body reading, times out after 20 seconds.

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

Open the local URL printed by Vite. Browser tests normally use port 5191.
`FIGUREWALK_TEST_URL` can target an existing server. For installed macOS Chrome:

```sh
FIGUREWALK_TEST_URL=http://127.0.0.1:5176 \
FIGUREWALK_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
npm run test:browser
```

### Local AI setup

Copy `.env.example` to `.env.local`, then set `TINKER_API_KEY` and the full
sampler checkpoint path in `TINKER_MODEL_PATH`. Both AI features use Tinker.
Restart Vite after
changing `.env.local`. The Vite development server handles `/api/sound-map` and
`/api/assistant`; these local endpoints are not included in the static production build.

Without a working AI service, Explorer still plays the standard acoustic sound.
The uploaded CSV/XLSX stays in the browser. The music advisor sends only computed
summary statistics. The voice guide sends the user's question plus a validated copy
of current prepared-chart context (up to 100 label/value points) when a chart answer
needs AI. It never sends source rows or the spreadsheet binary. API keys stay on the
server and `.env.local` is ignored by Git.

## Creator and learner flows

Home provides Creator Mode and User Mode, with the headline
“Data Shouldn't Have to Be Seen to Be Understood.” There is no automatic
music or data playback.

Creator: **01 Import → 02 Map → 03 Preview → 04 Publish → 05 Code**.
The enlarged step list remains beside the content and is clickable when a step
is available. CSV/XLSX format is detected automatically; Excel workbooks with
multiple worksheets still let the Creator choose a worksheet. Import CSV/XLSX, map
columns, unit and required repeated-category aggregation, preview the chart,
and choose a range when there are more than 100 points. A title is required;
a learning goal is optional. **Preview as learner** uses the same chart layout
as the real learner Explore screen. Two demonstration CSV files are in
`public/demo/`; they are not published automatically.

Only successful publication saves an independent revision and creates a
six-digit code. The code appears on the separate Code page. Republishing keeps
the material ID, increments the revision, and creates a new code. The Code
page's **Open User Mode** directly opens the newly published material.

User Mode accepts a six-digit code, or resumes the most recently opened material
in the same tab. An invalid code stays on the form. The learner Overview is a
brief invitation; the learner can ask the floating guide for the spoken data
summary. Explore presents a large chart without extra point or playback panels.
Focus the chart to use its four shortcuts: Left/Right select the previous/next
point, Enter reads its exact label, displayed value and unit, and Space starts
voice input; press Space again to stop and send the question. Shortcuts are scoped
to the focused chart and do not
intercept keys from buttons, links, forms or the rest of the page. The recent
code is kept in session storage and restored
from the browser's published-material library on reload.

Returning home preserves the current Creator draft in this tab. **Continue
draft** restores its step, imported table and edits. Drafts do not survive
page reload or tab close. Published revisions and codes persist in local browser
storage. There is no account login, database or cross-device code service.

**Material Archive** in the header lists every published revision and its
locally saved class code. It can reopen a revision in Creator or User Mode.
Replacing an upload or opening a different revision parks the current draft in
the Archive for this tab. Archived published materials persist after reload;
parked drafts do not. The supplied logo artwork is paired with Black Ops One,
News Cycle, and Poppins from Google Fonts, with local fallbacks offline.

## Storage and JSON handoff

**Saved in this browser** means this browser profile and this origin, including its port. Codes are stored under `chartaloud.classroom.v1`; material revisions are stored under `chartaloud.materials.v1`. A code made here will not work in another browser or on another device. Exporting a published JSON snapshot can transfer the material data, but the current User Mode is code-gated and has no JSON import screen. A teammate can reopen the JSON in a future import workflow or use the same browser for this demo. The snapshots contain at most 100 selected points, not spreadsheet binaries. Storage failure is reported without showing a success code or discarding the Creator draft.

Use **Export published JSON** on the Creator Code page to download the saved revision. No real share links are generated.

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
- More than 100 mapped points initially show the first 100; Preview can select a continuous inclusive range of
  1–100 points. No silent truncation. Chart, overview, statistics and audio use
  exactly that range. Partial data never claims to represent the full table.
- Changing mapping or ranges stops all old audio and clears derived results.

## Keyboard, speech and audio

The global guide supports typed input and browser `SpeechRecognition`/
`webkitSpeechRecognition` when available. Voice capture is English (`en-US`) and
stops after three seconds without a recognition result; Stop ends it immediately.
Both paths use the same assistant. Browsers do not allow a site to choose an arbitrary
local file from a spoken filename, so voice can open and focus the import task, but
the user must confirm the native file picker. Microphone denial and unsupported
browsers leave the text input fully usable.

Opening User Explore focuses the chart automatically, so keyboard exploration
does not require a preliminary Tab. Tab itself remains the browser's standard
focus navigation (not a custom chart shortcut). The chart handles only these
four shortcuts:

- Left/Right select the previous/next point.
- Enter explicitly reads the current label, displayed numeric value and unit.
- Space starts voice input; press it again to stop listening and send the
  question. This applies in Creator Preview, User Explore and learner preview.

Tab and other keys retain their normal browser and assistive-technology behavior;
they are not custom chart shortcuts. Chart shortcuts do not override controls,
links, forms, contenteditable fields, modifier combinations or repeated keydown.
No `role="application"` is used. Screen
readers can use native buttons when they capture arrow keys. Progress updates change
only the selected-point UI and short status, preserving focus.

`src/playback.js` centrally owns oscillator notes, sequence pause/resume, recorded
music, exact-value speech, and assistant-answer speech. `src/kokoroSpeech.js`
loads the bundled voice and model locally through `src/kokoroSpeech.worker.js`.
The guide launcher visibly distinguishes listening, thinking/model loading,
speaking, ready and error states. Speech cancels music and vice versa. Cancellation
clears timers and invalidates stale asynchronous callbacks. Exact-value speech uses
the bundled `af_heart` voice, with the browser's English voice as a fallback;
unsupported/blocked APIs show English status messages. Assistant replies have a visible transcript, so
speech is never the only output. The existing event-based `src/guidance.js` adapter
remains inert; the new user-initiated guide is a separate explicit chat interaction.
See [Guidance integration](docs/GUIDANCE_INTEGRATION.md) for that internal event API.

## Modules and verification

- `src/import-data.js`: CSV/XLSX parsing and table preparation.
- `src/mapping.js`: validation, aggregation, recommendations and explicit range selection.
- `src/materials.js`: schema validation, immutable snapshots, revisions, Sample and local persistence.
- `src/main.js`: mode flows and a shared Explorer for Creator/User, focus and keyboard behavior.
- `src/playback.js`: centralized cancellation and playback; existing recorded engine remains in
  `src/audioEngine.js`, with arrangements/samples/ambience in their existing modules.
- `src/voiceAssistant.js`: persistent chat, local safe commands, English recognition,
  three-second silence handling, and assistant requests.
- `server/ai-assistant.js`: server-only Tinker proxy and strict context validation.
- `src/guidance.js`: deliberately unimplemented integration adapter.

The automated checks cover original import/mapping/range behavior plus immutable
revision publication, Creator-to-User equality, JSON export/import into an independent
browser context, invalid input and failed storage recovery, keyboard controls,
explicit speech, assistant request validation, cancellation and real Chrome Web Audio. Tests cannot establish
physical audio quality or full VoiceOver/NVDA behavior. Those require manual listening
and assistive-technology testing; do not claim accessibility compliance from automation.
Review screenshots are saved in `artifacts/screenshots/` by the browser suite.

Brand source images remain in `assets/brand-source/`; UI cutouts are in `public/brand/`.
Instrument and ambience attribution remains in [SAMPLE_CREDITS.md](SAMPLE_CREDITS.md).
