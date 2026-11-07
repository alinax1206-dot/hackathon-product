# Audio Guidance integration (not implemented)

`src/guidance.js` exports `createGuidanceAdapter({ cancelPlayback })`. Its current
`implemented` flag is `false`; `emit` and `cancel` are no-ops. It has no network,
script generation, SpeechSynthesis, timers, or automatic sound. The UI displays
non-interactive “Audio guidance · Coming soon”. There is no homepage Space handler.

A future teammate can replace the adapter internals without changing the Explorer.
Do not connect guidance to `Playback.speak` implicitly: that method currently serves
explicit exact-value reading only. Future welcome messages and instructions belong
to the guidance implementation, not render functions.

## Events

`main.js` calls the adapter with a fresh small context object:

```js
{
  mode: 'creator' | 'user' | null,
  materialId: string | null,
  revision: number | null,
  selectedPointId: string | null, // point-<1-based original mapped index>
  playbackState: 'stopped' | 'loading' | 'playing' | 'paused' | 'speaking'
}
```

No source worksheet or full dataset is sent by these events. Draft previews have
no published material identity. Point IDs are stable within a material revision
and refer to its selected range in original mapped order.

| Event | Timing |
| --- | --- |
| `modeEntered` | After the selected mode renders and its title receives focus. |
| `materialOpened` | After a validated snapshot becomes the current dataset, old playback stops, and title receives focus. |
| `overviewRequested` | After the learner explicitly presses Show overview; the visible overview receives focus. |
| `pointSelected` | On explicit point selection and sequence progress; UI updates without rebuilding the Explorer. |
| `playbackChanged` | When the central playback controller updates a short status. |
| `errorOccurred` | On playback errors, failed publication, or material import errors. Errors remain visible in English. |
| `contextExited` | When leaving an Explorer, opening/replacing a material, or returning home. |

`stopAll()` also calls `adapter.cancel()` on navigation, data changes, point changes,
and new playback. Future guidance should use generation tokens or equivalent
cancellation to discard stale async results. `adapter.stopPlayback()` cancels
music, oscillator notes, sequence timers, and exact-value speech before guidance
speaks. It calls the playback controller directly, avoiding recursive adapter
cancellation. Avoid starting speech in response to its own playback status events.

Guidance must be opt-in and initiated by a valid user gesture. Cancel it when a
context exits. Do not assume speech or Web Audio is available, do not detect screen
readers, and do not use long aria-live messages that duplicate generated speech.
A future homepage Space shortcut must exclude controls and editable regions,
modifiers and repeated keydown events; it is deliberately absent now.

## Read-only facts for future agents

`window.chartaloudContext.getCurrent()` returns a structured clone of the current
mode, current User material (or null), selected point with stable point ID, and
computed `{ hi, lo, count }`. Mutating the copy cannot change application state.
Only this explicit pull interface contains the active material; events do not
send it anywhere. Facts come from the same selected dataset that the Explorer and
playback consume. There is no AI/chat integration.
