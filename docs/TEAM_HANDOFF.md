# Team handoff: voice and keyboard

This branch is the integrated ChartAloud UI and Creator → Publish → Code → User flow. Run `npm ci`, then `npm run dev`. The demo CSV files are in `public/demo/`. Use `npm test`, `npm run build`, and `npm run test:browser` before merging changes.

## Voice package

- `src/voiceAssistant.js` owns the floating guide, microphone capture, short English greetings, chat, and local voice commands. Recognition is set to `en-US`.
- `src/playback.js` owns speech output and audio cancellation. Chart values and assistant answers use the bundled Kokoro `af_heart` voice through `src/kokoroSpeech.js` and its Web Worker; short greetings use an installed English browser voice. Preserve `onEnd`, cancellation, and greeting behavior when changing this path.
- `server/ai-assistant.js` sends questions and verified chart context to Tinker and requests English answers. `server/ai-sound-advisor.js` handles the music suggestion. Copy `.env.example` to `.env.local` for local credentials; `.env.local` is ignored by Git and must never be committed.
- Browser autoplay rules can block speech on first page load. Keep a user initiated way to hear guidance. Check speech quality and screen reader behavior manually on target devices.

## Keyboard mapping

- Chart interactions and key handling are in `src/main.js` near the bottom. Entering User Explore focuses the chart automatically; Space also starts/sends voice input anywhere in Explore unless focus is in an input or unrelated control. Tab remains native browser focus navigation, not a custom chart shortcut. Left/Right select the previous/next point, Enter reads its exact label, value and unit, and Space starts voice input; pressing Space again ends recording and sends the question. The same mapping applies to Creator Preview and User Explore. The guide launcher announces Ready, Listening, Thinking/Preparing, Speaking, or microphone/error states; state glow is a CSS drop-shadow on the transparent mascot artwork, not the rectangular launcher.
- Avoid taking keys from text fields, buttons, links, dialogs, or a screen reader. Update the visible keyboard hint and `aria-describedby` instructions with any new mapping.
- `tests/browser/flow.spec.js` covers point selection and speech; `tests/browser/materials.spec.js` covers User entry, archive, and greetings. Add browser checks for any new key behavior.

## Material storage

Published revisions and six digit codes are stored in this browser's local storage and listed in Material Archive. Parked drafts exist only in the current tab's memory and disappear on reload. Codes do not work across devices without a backend. Archive review restores the published snapshot; it does not restore the original CSV/XLSX rows.
