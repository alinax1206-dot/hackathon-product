import { publishLesson, unlockLesson, readClassroom } from "./classroom.js";
import { answerChartQuestion } from "./chartQuestions.js";
import {
  DEFAULT_DECIMAL_PLACES,
  MAX_DECIMAL_PLACES,
  formatValue,
} from "./format-value.js";
import { parseFile, prepareTable } from "./import-data.js";
import {
  MAX_EXPLORATION_POINTS,
  mapColumns,
  recommendValue,
  selectRange,
  rangeDescription,
  aggregationLabels,
} from "./mapping.js";
import "./style.css";
import "./aiAdvisor.css";
import "./voiceAssistant.css";
import "./motion/chat-mascot.js";
import { Playback } from "./playback.js";
import { VoiceAssistant } from "./voiceAssistant.js";
import { createGuidanceAdapter } from "./guidance.js";
import {
  SAMPLE_MATERIAL,
  createMaterial,
  validateMaterial,
  readLibrary,
  saveMaterial,
  parseMaterialJSON,
  MAX_JSON_BYTES,
} from "./materials.js";
import { STYLES } from "./arrangement.js";

const state = {
  account: null,
  unlocked: null,
  classLesson: null,
  step: 0,
  rows: [],
  fields: [],
  headerAdjustments: [],
  x: "",
  y: "",
  data: null,
  selected: 0,
  mode: null,
  view: null,
  creatorStep: 1,
  creatorData: null,
  metadata: { title: "", description: "", learningGoal: "" },
  published: null,
  material: null,
  library: [],
  libraryError: "",
  parkedDrafts: [],
  dirty: false,
  learnerPreview: false,
  previewReturn: 3,
  notice: "",
  playbackState: "stopped",
  file: "",
  error: "",
  sheets: [],
  sheet: "",
  aggregation: "none",
  aggregationError: false,
  unit: "",
  decimalPlaces: DEFAULT_DECIMAL_PLACES,
  noUnit: false,
  mapped: null,
  start: "",
  end: "",
  musicStyle: "acoustic",
  playerStatus: "Ready to play.",
  aiDataset: null,
  soundMapping: "linear",
  aiRecommendation: null,
  aiStatus: "",
  aiBusy: false,
  aiManualOverride: false,
  aiSettingsOpen: false,
};
let importGeneration = 0;
let aiRequestGeneration = 0;
let assistant = null;
const playback = new Playback({
  onPoint: (index) => {
    state.selected = index;
    updateSelectedPoint();
    emitGuidance("pointSelected");
  },
  onStatus: (message) => {
    state.playerStatus = message;
    assistant?.setSpeechActivity(message);
    state.playbackState =
      message.startsWith("Reading") || message.startsWith("Speaking")
        ? "speaking"
        : message.includes("paused")
          ? "paused"
          : message.startsWith("Playing")
            ? "playing"
            : ["Loading", "Downloading", "Preparing"].some((prefix) =>
                  message.startsWith(prefix),
                )
              ? "loading"
              : "stopped";
    const live = document.querySelector("#player-status");
    if (live) live.textContent = message;
    const assistantLive = document.querySelector("#assistant-status");
    if (assistantLive && playback.kind === "speech")
      assistantLive.textContent = message;
    updatePlaybackButtons();
    emitGuidance("playbackChanged");
  },
  onError: (message) => {
    state.playerStatus = message;
    assistant?.setSpeechActivity(message, true);
    const live = document.querySelector("#player-status");
    if (live) live.textContent = message;
    emitGuidance("errorOccurred");
  },
});
const guidance = createGuidanceAdapter({
  cancelPlayback: () => playback.stop(),
});
function emitGuidance(event) {
  guidance.emit(event, {
    mode: state.mode,
    materialId: state.material?.id ?? null,
    revision: state.material?.revision ?? null,
    selectedPointId: state.data
      ? `point-${state.data.range.start + state.selected}`
      : null,
    playbackState: state.playbackState,
  });
}
function updatePlaybackButtons() {
  const dataButton = document.querySelector("#play"),
    musicButton = document.querySelector("#play-music");
  if (dataButton) {
    dataButton.textContent = playback.dataLabel(state.data);
    dataButton.disabled =
      state.aiBusy ||
      (playback.kind === "music" && playback.engine.status === "loading");
  }
  const readButton = document.querySelector(".learner-point #read-value");
  if (readButton)
    readButton.innerHTML = `${state.playbackState === "speaking" ? "Stop audio" : "Read selected value"} <kbd>Enter</kbd>`;
  const pauseButton = document.querySelector("#pause-music");
  if (pauseButton) {
    pauseButton.textContent = playback.pauseLabel;
    pauseButton.disabled = !playback.canPause;
  }
  if (musicButton) {
    musicButton.textContent = playback.musicLabel;
    musicButton.disabled =
      state.aiBusy ||
      (playback.kind === "music" && playback.engine.status === "loading");
  }
}
function updateSelectedPoint() {
  const point = state.data?.data[state.selected];
  if (!point) return;
  document.querySelectorAll("[data-point]").forEach((button) => {
    const active = Number(button.dataset.point) === state.selected;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const count = document.querySelector("#selected-count"),
    label = document.querySelector("#selected-label"),
    value = document.querySelector("#selected-value");
  if (count)
    count.textContent =
      state.mode === "user"
        ? `${state.selected + 1} of ${state.data.data.length}`
        : `SELECTED POINT ${state.selected + 1} / ${state.data.data.length}`;
  if (label) label.textContent = point.label;
  const selectionStatus = document.querySelector("#selection-status");
  if (selectionStatus)
    selectionStatus.textContent = `Point ${state.selected + 1} selected: ${point.label}.`;
  if (value)
    value.textContent = `${formatValue(point.value, state.data)} ${state.data.unit}`;
}
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function stopAll() {
  playback.stop();
  guidance.cancel();
  assistant?.cancelListening(false);
  assistant?.setSpeaking(false);
}
function readPoint() {
  const p = state.data.data[state.selected];
  const unit = state.data.unit ? ` ${state.data.unit}` : "";
  playback.speak(
    `${p.label}, ${formatValue(p.value, state.data)}${unit}.`,
    true,
  );
}
function selectPoint(index) {
  stopAll();
  state.selected = index;
  updateSelectedPoint();
  emitGuidance("pointSelected");
}
function handleChartKeydown(e) {
  const explorer = document.querySelector("#explorer");
  if (
    e.isComposing ||
    e.altKey ||
    e.ctrlKey ||
    e.metaKey ||
    e.shiftKey ||
    e.repeat
  )
    return;
  const target = e.target instanceof Element ? e.target : null;
  const inChart =
    explorer && (target === explorer || explorer.contains(target));
  const editable = target?.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
  );
  // A second Space always sends the recording, including after focus changes.
  // Outside recording, preserve spaces in text fields.
  if (e.key === " ") {
    if (!assistant.listening && editable) return;
    e.preventDefault();
    e.stopPropagation();
    if (assistant.busy) return;
    if (assistant.listening) assistant.finishListening(true);
    else assistant.startListening();
    return;
  }
  if (
    !inChart ||
    editable ||
    !["ArrowLeft", "ArrowRight", "Enter"].includes(e.key)
  )
    return;
  e.preventDefault();
  if (e.key === "Enter") readPoint();
  else
    selectPoint(
      Math.max(
        0,
        Math.min(
          state.data.data.length - 1,
          state.selected + (e.key === "ArrowRight" ? 1 : -1),
        ),
      ),
    );
}
function summary() {
  const d = state.data.data;
  const hi = d.reduce((a, b) => (a.value >= b.value ? a : b)),
    lo = d.reduce((a, b) => (a.value <= b.value ? a : b));
  return { hi, lo, count: d.length };
}
function focusTitle() {
  document.querySelector("h1")?.focus();
}
function go(step) {
  if (state.step === 3 && step !== 3) {
    emitGuidance("contextExited");
    aiRequestGeneration++;
    state.aiBusy = false;
  }
  stopAll();
  state.step = step;
  state.error = "";
  state.notice = "";
  if (state.mode === "creator") state.creatorStep = step;
  const suggestAutomatically =
    state.mode === "creator" &&
    step === 3 &&
    (resetAiForDataset() ||
      (!state.aiRecommendation && !state.aiBusy && !state.aiManualOverride));
  if (suggestAutomatically) requestAiSuggestion({ renderBeforeFetch: false });
  render();
  if (step === 3)
    document.querySelector("#explorer")?.focus({ preventScroll: true });
  else focusTitle();
}
function home() {
  importGeneration++;
  aiRequestGeneration++;
  state.aiBusy = false;
  stopAll();
  assistant.open = false;
  emitGuidance("contextExited");
  if (state.mode === "creator") {
    state.creatorStep = state.learnerPreview ? state.previewReturn : state.step;
    state.creatorData = state.data;
  }
  state.mode = null;
  state.view = null;
  state.data = null;
  state.material = null;
  state.learnerPreview = false;
  state.step = 0;
  state.error = "";
  state.notice = "";
  render();
  focusTitle();
  assistant.welcomeMode("home");
}
function enterCreator() {
  try {
    let id = localStorage.getItem("chartaloud.creator.id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("chartaloud.creator.id", id);
    }
    state.account = { id, name: "Creator", role: "creator" };
  } catch (e) {
    state.error = "Browser storage is unavailable. Enable it and retry.";
    render();
    return;
  }
  stopAll();
  state.mode = "creator";
  state.view = null;
  state.material = null;
  state.data = state.creatorData;
  state.learnerPreview = false;
  go(state.creatorStep);
  emitGuidance("modeEntered");
}
function refreshLibrary() {
  try {
    state.library = readLibrary(localStorage);
    state.libraryError = "";
  } catch (e) {
    state.libraryError = e.message;
  }
}
function openArchive() {
  stopAll();
  refreshLibrary();
  state.view = "archive";
  state.error = state.libraryError;
  render();
  focusTitle();
}
function closeArchive() {
  state.view = null;
  state.error = "";
  render();
  focusTitle();
}
function archiveLesson(material) {
  try {
    return readClassroom(localStorage).lessons.find(
      (lesson) =>
        lesson.material.id === material.id &&
        lesson.material.revision === material.revision,
    );
  } catch {
    return null;
  }
}
const DRAFT_FIELDS = [
  "creatorStep",
  "rows",
  "fields",
  "headerAdjustments",
  "x",
  "y",
  "data",
  "metadata",
  "published",
  "classLesson",
  "file",
  "sheets",
  "sheet",
  "aggregation",
  "unit",
  "decimalPlaces",
  "noUnit",
  "mapped",
  "start",
  "end",
  "musicStyle",
  "soundMapping",
  "selected",
];
function parkCurrentDraft() {
  if (state.mode !== "creator" || !state.dirty || (!state.file && !state.data))
    return;
  const values = Object.fromEntries(
    DRAFT_FIELDS.map((field) => [field, state[field]]),
  );
  state.parkedDrafts.push({
    label: state.metadata.title || state.file || "Untitled draft",
    savedAt: Date.now(),
    values: structuredClone(values),
  });
}
function resumeParkedDraft(index) {
  const draft = state.parkedDrafts.splice(index, 1)[0];
  if (!draft) return;
  parkCurrentDraft();
  Object.assign(state, structuredClone(draft.values));
  state.view = null;
  state.mode = "creator";
  state.account = {
    id: localStorage.getItem("chartaloud.creator.id") || crypto.randomUUID(),
    name: "Creator",
    role: "creator",
  };
  state.creatorData = state.data;
  state.aiDataset = state.data;
  state.aiManualOverride = true;
  state.learnerPreview = false;
  state.dirty = true;
  go(state.creatorStep);
}
function reviewArchiveMaterial(material) {
  const checked = validateMaterial(material);
  parkCurrentDraft();
  state.view = null;
  state.mode = "creator";
  state.account = {
    id: localStorage.getItem("chartaloud.creator.id") || crypto.randomUUID(),
    name: "Creator",
    role: "creator",
  };
  state.material = null;
  state.data = structuredClone(checked.dataset);
  state.creatorData = state.data;
  state.mapped = null;
  state.rows = [];
  state.fields = [];
  state.sheets = [];
  state.file = checked.dataset.title;
  state.metadata = {
    title: checked.title,
    description: checked.description,
    learningGoal: checked.learningGoal,
  };
  state.published = checked;
  state.classLesson = archiveLesson(checked) || null;
  state.musicStyle = state.classLesson?.style || "acoustic";
  state.soundMapping = "linear";
  playback.mapping = "linear";
  state.aiDataset = state.data;
  state.aiRecommendation = null;
  state.aiManualOverride = true;
  state.aiStatus = "Published music style is ready to play.";
  state.selected = 0;
  state.learnerPreview = false;
  state.dirty = false;
  go(3);
}
function rememberLesson(lesson) {
  state.unlocked = lesson;
  try {
    sessionStorage.setItem("chartaloud.recentCode", lesson.code);
  } catch {}
}
function restoreRecentLesson() {
  if (state.unlocked) return;
  try {
    const code = sessionStorage.getItem("chartaloud.recentCode");
    if (code)
      state.unlocked = unlockLesson(localStorage, { id: "learner" }, code);
  } catch {}
}
function enterUser(openPublished = false) {
  if (state.mode === "creator") {
    state.creatorStep = state.learnerPreview ? state.previewReturn : state.step;
    state.creatorData = state.data;
  }
  stopAll();
  state.account = { id: "learner", name: "Learner", role: "user" };
  state.mode = "user";
  state.view = null;
  state.data = null;
  state.material = null;
  state.learnerPreview = false;
  refreshLibrary();
  if (openPublished && state.classLesson && !state.dirty) {
    rememberLesson(state.classLesson);
    openMaterial(state.classLesson.material);
  } else {
    restoreRecentLesson();
    go(1);
    assistant.welcomeMode("user");
  }
  emitGuidance("modeEntered");
}
function openMaterial(material) {
  if (
    state.account?.role === "user" &&
    state.unlocked?.material.id !== material.id
  ) {
    state.error = "Enter your teacher’s code first.";
    render();
    return;
  }
  stopAll();
  emitGuidance("contextExited");
  state.material = validateMaterial(material);
  state.data = structuredClone(state.material.dataset);
  state.aiDataset = state.data;
  state.aiRecommendation = null;
  state.aiStatus = "Published music style is ready to play.";
  state.aiBusy = false;
  state.aiManualOverride = true;
  state.soundMapping = "linear";
  playback.mapping = "linear";
  state.selected = 0;
  go(3);
  emitGuidance("materialOpened");
  if (state.mode === "user") assistant.welcome(state.material.title, true);
}
function exportMaterial(material) {
  const checked = validateMaterial(material);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(checked, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${checked.id}-r${checked.revision}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function invalidate() {
  stopAll();
  state.dirty = true;
  state.aggregationError = false;
  state.creatorData = null;
  state.data = null;
  state.mapped = null;
  state.start = "";
  state.end = "";
  state.selected = 0;
  state.error = "";
}
function chooseSheet(name) {
  invalidate();
  state.sheet = name;
  state.rows = [];
  state.fields = [];
  state.headerAdjustments = [];
  state.aggregation = "none";
  state.unit = "";
  state.decimalPlaces = DEFAULT_DECIMAL_PLACES;
  state.noUnit = false;
  if (!name) return;
  const prepared = prepareTable(
    state.sheets.find((s) => s.name === name).table,
  );
  Object.assign(state, prepared);
  const generated = new Set(
    state.headerAdjustments
      .filter(({ original }) => !original)
      .map(({ name }) => name),
  );
  state.x =
    state.fields.find((field) => !generated.has(field)) || state.fields[0];
  state.y = recommendValue(
    state.fields.filter((field) => !generated.has(field)),
    state.rows,
    state.x,
  );
}
function loadSheets(sheets, name) {
  invalidate();
  state.sheets = sheets;
  state.file = name;
  state.metadata.title = name.replace(/\.(csv|xlsx)$/i, "");
  state.sheet = "";
  state.rows = [];
  state.fields = [];
  state.headerAdjustments = [];
  go(2);
  if (sheets.length === 1) {
    try {
      chooseSheet(sheets[0].name);
    } catch (error) {
      state.error = error.message;
    }
    render();
  }
}
function buildMapping() {
  if (repeatedCategoryCount() > 0 && state.aggregation === "none") {
    state.aggregationError = true;
    render();
    document.querySelector("#aggregation")?.focus();
    return;
  }
  state.aggregationError = false;
  state.mapped = mapColumns(state.rows, {
    ...state,
    title: state.file.replace(/\.(csv|xlsx)$/i, ""),
  });
  if (state.mapped.totalPoints <= MAX_EXPLORATION_POINTS)
    openExplorer(1, state.mapped.totalPoints);
  else openExplorer(1, MAX_EXPLORATION_POINTS);
}
function repeatedCategoryCount() {
  if (!state.x || !state.rows.length) return 0;
  const seen = new Set();
  let count = 0;
  for (const row of state.rows) {
    const raw = row[state.x];
    const label = raw instanceof Date ? raw.toISOString() : String(raw ?? "");
    if (seen.has(label)) count++;
    else seen.add(label);
  }
  return count;
}
function openExplorer(start, end) {
  stopAll();
  state.data = selectRange(state.mapped, start, end);
  state.start = String(start);
  state.end = String(end);
  state.selected = 0;
  state.creatorData = state.data;
  go(3);
}
function resetAiForDataset() {
  if (!state.data || state.aiDataset === state.data) return false;
  state.aiDataset = state.data;
  state.soundMapping = "linear";
  state.musicStyle = "acoustic";
  state.aiRecommendation = null;
  state.aiStatus = "Setting up sound…";
  state.aiBusy = false;
  state.aiManualOverride = false;
  state.aiSettingsOpen = false;
  playback.mapping = "linear";
  return true;
}
async function requestAiSuggestion({ renderBeforeFetch = true } = {}) {
  if (!state.data || state.aiBusy) return;
  const dataset = state.data;
  const requestGeneration = ++aiRequestGeneration;
  state.aiBusy = true;
  state.aiStatus = "Choosing sound…";
  if (renderBeforeFetch) {
    const focusedId = document.activeElement?.id;
    render();
    if (focusedId)
      document.getElementById(focusedId)?.focus({ preventScroll: true });
  }
  try {
    const response = await fetch("/api/sound-map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        values: dataset.data.map((point) => point.value),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "AI request failed");
    if (
      !["linear", "contrast"].includes(result.mapping) ||
      !STYLES[result.style] ||
      typeof result.reason !== "string"
    )
      throw new Error("Invalid AI recommendation");
    if (
      state.data !== dataset ||
      state.step !== 3 ||
      requestGeneration !== aiRequestGeneration
    )
      return;
    state.aiRecommendation = result;
    if (state.aiManualOverride) {
      state.aiStatus = "Your sound choice is kept.";
    } else {
      state.soundMapping = result.mapping;
      playback.mapping = result.mapping;
      state.musicStyle = result.style;
      state.aiStatus = `AI chose ${STYLES[result.style].name}. Ready to play.`;
    }
  } catch (error) {
    if (
      state.data === dataset &&
      state.step === 3 &&
      requestGeneration === aiRequestGeneration
    )
      state.aiStatus = "AI is unavailable. Standard sound is ready to play.";
  } finally {
    if (
      state.data === dataset &&
      state.step === 3 &&
      requestGeneration === aiRequestGeneration
    ) {
      state.aiBusy = false;
      const focusedId = document.activeElement?.id;
      render();
      if (focusedId)
        document.getElementById(focusedId)?.focus({ preventScroll: true });
    }
  }
}
function mappingContent() {
  const repeated = repeatedCategoryCount() > 0;
  const isExcel = state.file.toLowerCase().endsWith(".xlsx");
  const options = (selected) =>
    '<option value="">Choose a column</option>' +
    state.fields
      .map(
        (f) =>
          `<option value="${escape(f)}" ${f === selected ? "selected" : ""}>${escape(f)}</option>`,
      )
      .join("");
  return `<section class="mapping-screen"><h1 tabindex="-1">Map your data</h1>
    <div class="panel"><div class="mapping-file"><p class="detected-format">Format <strong>${isExcel ? "Excel (.xlsx)" : "CSV (.csv)"}</strong></p>${isExcel && state.sheets.length > 1 ? `<label for="sheet">Worksheet<select id="sheet"><option value="">Choose a worksheet</option>${state.sheets.map((s) => `<option value="${escape(s.name)}" ${s.name === state.sheet ? "selected" : ""}>${escape(s.name)}</option>`).join("")}</select></label>` : ""}</div>
    ${state.headerAdjustments.length ? `<div class="notice" role="status"><strong>Column names adjusted for import.</strong> Your original file was not changed.<ul>${state.headerAdjustments.map(({ column, original, name }) => `<li>Column ${column}: ${original ? `“${escape(original)}”` : "blank header"} → “${escape(name)}”</li>`).join("")}</ul></div>` : ""}
    ${
      state.fields.length
        ? `<div class="mapping">
    <label>Compare by<select id="x">${options(state.x)}</select></label>
    <label>Value to hear<select id="y" ${state.aggregation === "count" ? "disabled" : ""}>${options(state.y)}</select></label>
    <div class="unit-field"><div class="unit-heading"><label for="unit">Unit</label><label class="no-unit-option"><input id="noUnit" type="checkbox" ${state.noUnit ? "checked" : ""} ${state.aggregation === "count" ? "disabled" : ""}> No unit</label></div><input id="unit" type="text" value="${escape(state.aggregation === "count" ? "records" : state.unit)}" ${state.aggregation === "count" || state.noUnit ? "disabled" : ""}></div>
    <label>Decimal places<select id="decimalPlaces" ${state.aggregation === "count" ? "disabled" : ""}>${Array.from({ length: MAX_DECIMAL_PLACES + 1 }, (_, places) => `<option value="${places}" ${places === (state.aggregation === "count" ? 0 : state.decimalPlaces) ? "selected" : ""}>${places}</option>`).join("")}</select></label>
    <label class="aggregation-field ${state.aggregationError ? "has-error" : ""}">Repeated categories ${repeated ? '<span class="required-mark" aria-label="required">*</span>' : ""}<select id="aggregation" ${repeated ? 'required aria-required="true"' : ""} ${state.aggregationError ? 'aria-invalid="true" aria-describedby="aggregation-error"' : ""}>${repeated ? `<option value="" disabled ${state.aggregation === "none" ? "selected" : ""}>Choose how to combine</option>` : ""}${Object.entries(
      aggregationLabels,
    )
      .filter(([value]) => !repeated || value !== "none")
      .map(
        ([value, label]) =>
          `<option value="${value}" ${state.aggregation === value ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select>${state.aggregationError ? '<span id="aggregation-error" class="field-error" role="alert">Choose how to combine repeated categories.</span>' : ""}</label></div>
    <button class="button" id="explore">Validate mapping and continue</button><details class="preview-details"><summary>Imported table preview (5 rows)</summary><div class="table-wrap"><table><thead><tr>${state.fields.map((f) => `<th scope="col">${escape(f)}</th>`).join("")}</tr></thead><tbody>${state.rows
      .slice(0, 5)
      .map(
        (r) =>
          `<tr>${state.fields.map((f) => `<td>${escape(r[f] ?? "")}</td>`).join("")}</tr>`,
      )
      .join("")}</tbody></table></div>
    </details>`
        : ""
    }
    </div></section>`;
}
const logo = `<img class="brand-logo" src="/brand/figurewalk-logo-transparent.png" alt="" width="130" height="98">`;
function metadataContent() {
  return `<div class="panel material-metadata"><h2>Learning material details</h2><div class="mapping"><label>Title (required)<input id="material-title" data-metadata="title" required maxlength="10000" value="${escape(state.metadata.title)}"></label><label>Learning goal (optional)<input data-metadata="learningGoal" maxlength="10000" value="${escape(state.metadata.learningGoal)}"></label></div></div>`;
}
function rangeContent() {
  if (!state.mapped || state.mapped.totalPoints <= MAX_EXPLORATION_POINTS)
    return "";
  return `<div class="panel preview-range"><h2>Preview range</h2><div class="mapping"><label>First point (inclusive)<input id="rangeStart" type="number" min="1" max="${state.mapped.totalPoints}" value="${escape(state.start)}"></label><label>Last point (inclusive)<input id="rangeEnd" type="number" min="1" max="${state.mapped.totalPoints}" value="${escape(state.end)}"></label><button id="applyRange" class="button">Update preview</button></div></div>`;
}
function overviewText() {
  const s = summary(),
    d = state.data;
  return `${d.yAxis} by ${d.xAxis}. Unit: ${d.unit || "No unit"}. ${s.count} selected data points. ${aggregationLabels[d.aggregation]}. ${rangeDescription(d)} Highest is ${s.hi.label}, ${formatValue(s.hi.value, d)} ${d.unit}. Lowest is ${s.lo.label}, ${formatValue(s.lo.value, d)} ${d.unit}.`;
}
function libraryContent() {
  return `<section class="materials-screen"><h1 tabindex="-1">Your learning material</h1>${state.unlocked ? `<div class="panel recent-material"><h2>${escape(state.unlocked.material.title)}</h2><p>Code ${escape(state.unlocked.code)}</p><button id="continue-recent" class="button">Continue learning</button></div>` : ""}<form id="join-class-form" class="panel"><label for="class-code">Six-digit class code</label><input id="class-code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required autocomplete="off"><button id="join-class" class="button" type="submit">Open another material</button></form></section>`;
}
function archiveContent() {
  const items = [...state.library].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  const draftCards = state.parkedDrafts
    .map(
      (draft, index) =>
        `<article class="archive-card draft-card"><div><h2>${escape(draft.label)}</h2><p>Draft · kept in this tab until reload</p></div><button type="button" data-resume-draft="${index}" class="button">Resume draft</button></article>`,
    )
    .join("");
  return `<section class="archive-screen"><h1 tabindex="-1">Material Archive</h1><p class="archive-intro">Published materials are saved in this browser. Drafts stay in this tab.</p>${state.mode === "creator" && state.dirty ? `<article class="archive-card draft-card"><div><h2>${escape(state.metadata.title || state.file || "Current draft")}</h2><p>Current draft · kept in this tab until reload</p></div><button type="button" id="resume-current-draft" class="button">Resume draft</button></article>` : ""}${draftCards}${
    items.length
      ? `<div class="archive-list">${items
          .map((material, index) => {
            const lesson = archiveLesson(material);
            const date = new Date(material.createdAt).toLocaleDateString(
              "en-US",
              { year: "numeric", month: "short", day: "numeric" },
            );
            return `<article class="archive-card"><div><h2>${escape(material.title)}</h2><p>Revision ${material.revision} · ${escape(date)} · ${material.dataset.data.length} points</p>${lesson ? `<p class="archive-code">Code <strong>${escape(lesson.code)}</strong></p>` : '<p class="archive-code">No class code saved</p>'}</div><div class="archive-actions"><button type="button" data-review-archive="${index}" class="button">Review in Creator</button>${lesson ? `<button type="button" data-learn-archive="${index}">Open as learner</button>` : ""}</div></article>`;
          })
          .join("")}</div>`
      : '<div class="panel archive-empty"><p>No published materials yet.</p><button type="button" id="archive-create" class="button">Create a material</button></div>'
  }</section>`;
}
function codeContent() {
  if (!state.classLesson || state.dirty) return publishContent();
  return `<section class="code-screen"><h1 tabindex="-1">Your class code</h1><div class="panel class-code"><p>Published successfully · ${escape(state.classLesson.material.title)}</p><strong>${state.classLesson.code}</strong><p>Share this six-digit code with your learners to open this chart and music.</p><p>Music style: ${escape(STYLES[state.classLesson.style].name)}.</p><p>Saved in this browser.</p></div><div class="actions"><button id="switch-user" class="button">Open User Mode</button><button id="new-material">Start another material</button><button id="export-published">Export published JSON</button></div></section>`;
}
function publishContent() {
  return `<section class="publish-screen"><h1 tabindex="-1">Publish learning material</h1><div class="panel"><h2>${escape(state.metadata.title)}</h2>${state.metadata.learningGoal ? `<p>Learning goal: ${escape(state.metadata.learningGoal)}</p>` : ""}<div class="actions"><button id="publish" class="button">Publish learning material</button></div></div></section>`;
}
function bindMaterials(on) {
  const materials = [...state.library, SAMPLE_MATERIAL];
  const joinForm = document.querySelector("#join-class-form");
  if (joinForm)
    joinForm.onsubmit = (event) => {
      event.preventDefault();
      try {
        const lesson = unlockLesson(
          localStorage,
          state.account,
          document.querySelector("#class-code").value.trim(),
        );
        rememberLesson(lesson);
        state.musicStyle = lesson.style;
        openMaterial(lesson.material);
      } catch (e) {
        state.error = e.message;
        render();
      }
    };

  document
    .querySelectorAll("[data-open-material]")
    .forEach(
      (el) =>
        (el.onclick = () =>
          openMaterial(materials[Number(el.dataset.openMaterial)])),
    );
  document
    .querySelectorAll("[data-export-material]")
    .forEach(
      (el) =>
        (el.onclick = () =>
          exportMaterial(materials[Number(el.dataset.exportMaterial)])),
    );
  on("retry-library", () => {
    refreshLibrary();
    render();
    focusTitle();
  });
  on("switch-user", () => enterUser(true));
  on("continue-recent", () => {
    if (state.unlocked) openMaterial(state.unlocked.material);
  });
  on("new-material", () => {
    stopAll();
    state.published = null;
    state.classLesson = null;
    state.metadata = { title: "", description: "", learningGoal: "" };
    state.rows = [];
    state.fields = [];
    state.sheets = [];
    state.sheet = "";
    state.file = "";
    state.x = "";
    state.y = "";
    state.mapped = null;
    state.data = null;
    state.creatorData = null;
    state.start = "";
    state.end = "";
    state.dirty = false;
    state.selected = 0;
    go(1);
  });
  on("export-current", () => exportMaterial(state.material));
  on("export-published", () => exportMaterial(state.published));
  on("export-draft", () => {
    try {
      exportMaterial(
        createMaterial(
          state.data,
          state.metadata,
          state.published,
          state.library,
        ),
      );
    } catch (e) {
      state.error = e.message;
      render();
      focusTitle();
    }
  });
  on("publish", () => {
    stopAll();
    try {
      // Read before writing: never overwrite a corrupted or newer library silently.
      const library = readLibrary(localStorage);
      const material = createMaterial(
        state.data,
        state.metadata,
        state.published,
        library,
      );
      state.library = saveMaterial(localStorage, library, material);
      if (state.account?.role === "creator")
        state.classLesson = publishLesson(
          localStorage,
          state.account.id,
          material,
          state.musicStyle,
        );
      state.published = material;
      state.dirty = false;
      state.error = "";
      state.libraryError = "";
      go(5);
      state.notice = `Published revision ${material.revision}. Your code is ready.`;
      render();
      focusTitle();
    } catch (e) {
      state.error = e.message;
      render();
      focusTitle();
      emitGuidance("errorOccurred");
    }
  });
  const input = document.querySelector("#material-file");
  if (input)
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      stopAll();
      const generation = ++importGeneration;
      try {
        if (file.size > MAX_JSON_BYTES)
          throw new Error(
            "Material file is too large. Choose a JSON file under 2 MB.",
          );
        const material = parseMaterialJSON(await file.text());
        if (generation !== importGeneration || state.mode !== "user") return;
        let saveError = "";
        try {
          const library = readLibrary(localStorage);
          state.library = saveMaterial(localStorage, library, material);
          state.libraryError = "";
        } catch (e) {
          if (e.code === "MATERIAL_CONFLICT") throw e;
          saveError = e.message;
        }
        openMaterial(material);
        if (saveError) {
          state.error = `${saveError} Opened for this session only. Keep the original JSON file and retry saving from the material list.`;
          render();
          focusTitle();
        } else {
          state.notice = "Imported and saved in this browser.";
          render();
          focusTitle();
        }
      } catch (e) {
        if (generation !== importGeneration || state.mode !== "user") return;
        state.error = e.message;
        render();
        document.querySelector("#material-file")?.focus();
        emitGuidance("errorOccurred");
      }
    };
}

function assistantContext() {
  const page =
    state.step === 0
      ? "home"
      : state.mode === "creator" && state.step === 1
        ? "creator import"
        : state.mode === "creator" && state.step === 2
          ? "creator mapping"
          : state.mode === "creator" && state.step === 4
            ? "creator publish"
            : state.mode === "user" && state.step === 1
              ? "learning materials"
              : "data explorer";
  return {
    page,
    mode: state.mode,
    fileName: state.file,
    availableColumns: state.fields,
    selectedX: state.x,
    selectedY: state.y,
    materialTitle:
      state.mode === "user"
        ? state.material?.title || ""
        : state.metadata.title,
    learningGoal:
      state.mode === "user"
        ? state.material?.learningGoal || ""
        : state.metadata.learningGoal,
    dataset:
      [2, 3].includes(state.step) && state.data
        ? {
            title: state.data.title,
            xAxis: state.data.xAxis,
            yAxis: state.data.yAxis,
            unit: state.data.unit,
            aggregation: state.data.aggregation,
            selectedIndex: state.selected,
            data: state.data.data.slice(0, 100).map(({ label, value }) => ({
              label,
              value,
            })),
          }
        : null,
  };
}

function openCreatorImport() {
  if (state.mode === "creator") {
    state.creatorData = state.data || state.creatorData;
  }
  state.mode = "creator";
  state.material = null;
  state.data = state.creatorData;
  state.learnerPreview = false;
  go(1);
  emitGuidance("modeEntered");
}

async function handleAssistantIntent(intent, text) {
  if ([2, 3].includes(state.step)) {
    const answer = answerChartQuestion(text, state.data);
    if (answer) return answer;
  }
  if (!intent) return null;
  if (intent === "home") {
    home();
    return "You are back on the home page. You can choose Creator Mode or User Mode.";
  }
  if (intent === "creator") {
    enterCreator();
    return "Creator Mode is open. You can import a spreadsheet, map its columns, preview it, and publish a learning material.";
  }
  if (intent === "user") {
    enterUser();
    return "User Mode is open. Enter the six-digit class code from your creator to explore the material with sound.";
  }
  if (intent === "choose-file") {
    openCreatorImport();
    setTimeout(() => document.querySelector('label[for="file"]')?.focus(), 0);
    return "The import page is ready. For privacy, a browser cannot select a local file from voice alone. Press Choose a file and select the CSV or Excel file you named.";
  }
  if (!state.data || ![2, 3].includes(state.step)) {
    return "There is no prepared chart on this page yet. Open a learning material or finish mapping a dataset first.";
  }
  if (intent === "overview") return overviewText();
  if (intent === "play-music") {
    if (state.aiBusy)
      return "The music recommendation is still loading. Please try again in a moment.";
    playback.music(state.data, state.musicStyle);
    return { answer: "Playing the current chart as music.", speak: false };
  }
  if (intent === "play-data") {
    if (state.aiBusy)
      return "The music recommendation is still loading. Please try again in a moment.";
    playback.music(state.data, state.musicStyle);
    return {
      answer: "Playing the chart with the selected music style.",
      speak: false,
    };
  }
  if (intent === "stop-audio") {
    playback.stop();
    return "Playback stopped.";
  }
  if (intent === "next-point") {
    selectPoint(Math.min(state.data.data.length - 1, state.selected + 1));
    const point = state.data.data[state.selected];
    return `Selected ${point.label}, ${formatValue(point.value, state.data)} ${state.data.unit}.`;
  }
  if (intent === "previous-point") {
    selectPoint(Math.max(0, state.selected - 1));
    const point = state.data.data[state.selected];
    return `Selected ${point.label}, ${formatValue(point.value, state.data)} ${state.data.unit}.`;
  }
  if (intent === "first-point" || intent === "last-point") {
    selectPoint(intent === "first-point" ? 0 : state.data.data.length - 1);
    const point = state.data.data[state.selected];
    return `Selected ${point.label}, ${formatValue(point.value, state.data)} ${state.data.unit}.`;
  }
  if (intent === "read-point") {
    const point = state.data.data[state.selected];
    readPoint();
    return {
      answer: `The selected point is ${point.label}, ${formatValue(point.value, state.data)} ${state.data.unit}.`,
      speak: false,
    };
  }
  return null;
}

assistant = new VoiceAssistant({
  getContext: assistantContext,
  handleIntent: handleAssistantIntent,
  stopPlayback: () => playback.stop(),
  speak: (text, onEnd, options) =>
    playback.speak(text, true, {
      status: "Speaking assistant response.",
      retryMessage:
        "The answer is visible, but speech could not start. Please ask again or read the answer above.",
      onEnd,
      bundledVoice: options.bundledVoice,
    }),
  requestRender: () => render(),
});

// A fresh copy only: future agents cannot mutate application state through this API.
Object.defineProperty(window, "chartaloudContext", {
  value: Object.freeze({
    getCurrent: () =>
      structuredClone({
        mode: state.mode,
        material: state.mode === "user" ? state.material : null,
        selectedPoint:
          state.step === 3 && state.data
            ? {
                id: `point-${state.data.range.start + state.selected}`,
                ...state.data.data[state.selected],
              }
            : null,
        statistics: state.step === 3 && state.data ? summary() : null,
      }),
  }),
});

function progressNav() {
  if (!state.mode) return "";
  const creator = state.mode === "creator";
  const labels = creator
    ? ["Import", "Map", "Preview", "Publish", "Code"]
    : ["Code", "Overview", "Explore"];
  return `<nav aria-label="${creator ? "Creator" : "User"} progress"><ol>${labels
    .map((label, index) => {
      const step = index + 1;
      const enabled = creator
        ? step === 1 ||
          (step === 2 && state.sheets.length > 0) ||
          (step === 3 && !!state.data) ||
          (step === 4 && !!state.data && !!state.metadata.title.trim()) ||
          (step === 5 && !!state.classLesson && !state.dirty)
        : step === 1 || !!state.unlocked;
      const current =
        state.step === step || (!creator && state.step === 3 && step === 3);
      return `<li ${current ? 'aria-current="step"' : ""}><button type="button" data-nav-step="${step}" ${enabled ? "" : "disabled"} aria-label="${String(step).padStart(2, "0")} ${label}"><span class="stepnum">${step < state.step ? "✓" : String(step).padStart(2, "0")}</span><span>${label}</span></button></li>`;
    })
    .join("")}</ol></nav>`;
}

function render() {
  const activeId =
    document.activeElement instanceof HTMLElement
      ? document.activeElement.id
      : "";
  document.querySelector("#app").innerHTML =
    `<a class="skip" href="#main">Skip to content</a><header><a href="#" class="brand" id="home" aria-label="ChartAloud Studio home">${logo}<span class="brand-words"><strong>ChartAloud</strong><small>studio</small></span></a><button type="button" id="archive-toggle" class="archive-header-action">${state.view === "archive" ? "Back to workspace" : "Material Archive"}</button></header><div class="layout ${state.view === "archive" ? "archive-layout" : state.learnerPreview || (state.mode === "user" && [2, 3].includes(state.step)) ? "learner-layout" : state.mode === "creator" ? "creator-layout" : !state.mode ? "home-layout" : ""}"><aside>${state.view === "archive" ? "" : progressNav()}</aside><main id="main">${state.error ? `<div role="alert" class="error">${escape(state.error)}</div>` : ""}${state.notice && state.view !== "archive" ? `<p role="status" class="notice">${escape(state.notice)}</p>` : ""}${content()}<footer><span>ChartAloud Studio · Your data stays in this browser.</span></footer></main></div>${assistant.html(escape)}`;
  document.querySelector("#home").onclick = (e) => {
    e.preventDefault();
    home();
  };
  bind();
  assistant.bind();
  if (activeId)
    document.getElementById(activeId)?.focus({ preventScroll: true });
}
function aiAdvisorContent() {
  if (!state.data) return "";
  const suggested = state.aiRecommendation;
  const usingSuggestion =
    suggested &&
    state.soundMapping === suggested.mapping &&
    state.musicStyle === suggested.style;
  const soundStatus = state.aiBusy
    ? "Choosing a sound…"
    : suggested
      ? `${usingSuggestion ? "AI suggestion" : "Your choice"}: ${STYLES[state.musicStyle].name}`
      : state.aiStatus.includes("unavailable")
        ? "Standard sound ready"
        : "Ready to play";
  return `<section class="ai-advisor" aria-labelledby="ai-advisor-title">
    <div class="ai-primary"><div><h2 id="ai-advisor-title">Music for your data</h2><p class="ai-status" role="status">${escape(soundStatus)}</p></div><button class="button" type="button" id="play-music" ${state.aiBusy ? "disabled" : ""}>${playback.musicLabel}</button></div>
    <details class="ai-settings" ${state.aiSettingsOpen ? "open" : ""}><summary>Adjust music</summary><div class="ai-controls">
      <label for="music-style">Music style<select id="music-style">${Object.entries(
        STYLES,
      )
        .map(
          ([key, value]) =>
            `<option value="${key}" ${key === state.musicStyle ? "selected" : ""}>${escape(value.name)}</option>`,
        )
        .join("")}</select></label>
      <label for="ai-mapping">Sound detail<select id="ai-mapping"><option value="linear" ${state.soundMapping === "linear" ? "selected" : ""}>Standard</option><option value="contrast" ${state.soundMapping === "contrast" ? "selected" : ""}>Emphasize smaller values</option></select></label>
      ${suggested && !usingSuggestion ? `<button type="button" id="ai-apply">Use AI suggestion</button>` : ""}
    </div><details class="ai-explanation"><summary>How is the sound chosen?</summary><p>Values map from low to high notes. Standard spaces notes evenly; Emphasize smaller values spreads out differences near the minimum. Tinker sees numerical summaries and suggests a music style; the style is a listening choice, not a fact about the dataset.</p>${suggested ? `<p class="ai-reason">For this chart: ${escape(suggested.reason)}</p>` : ""}</details></details>
  </section>`;
}

function coloredTitle(title) {
  return `<span class="colored-title" aria-hidden="true">${[...title].map((letter, index) => `<span class="title-letter title-color-${index % 6}">${escape(letter)}</span>`).join("")}</span>`;
}
function keyboardHelp(userMode) {
  return `<div class="keyboard-help" role="note" aria-label="Keyboard shortcuts">
    <strong>Keyboard shortcuts</strong>
    <p>${userMode ? "This chart is focused automatically when Explore opens. Use" : "The chart is focused automatically. Use"} <kbd>←</kbd>/<kbd>→</kbd> to select the previous or next point; <kbd>Enter</kbd> to hear its exact label, value and unit; <kbd>Space</kbd> to start voice input and press it again to stop and send your question.</p>
    ${userMode ? "<small>Voice replies use your browser voice. Highest and lowest value questions work without a remote AI connection.</small>" : ""}
  </div>`;
}
function learnerContent() {
  const data = state.data.data;
  const title =
    state.mode === "user"
      ? state.material.title
      : state.metadata.title || state.data.title;
  const range = Math.max(...data.map((item) => Math.abs(item.value))) || 1;
  const point = data[state.selected];
  return `<section class="learner-screen" aria-label="Learning chart">
    <h1 id="learner-title" tabindex="-1" aria-label="${escape(title)}">${coloredTitle(title)}</h1>
    ${state.learnerPreview ? '<p class="learner-preview-tag">Learner preview · unpublished</p>' : ""}
    <div class="learner-workspace"><section class="learner-chart" aria-labelledby="chart-heading">
      <div class="learner-chart-heading"><h2 id="chart-heading">${escape(state.data.yAxis)} by ${escape(state.data.xAxis)}</h2><p>${escape(state.data.unit || "No unit")}</p></div>
      ${keyboardHelp(state.mode === "user" && !state.learnerPreview)}
      <div class="chart" id="explorer" tabindex="0" role="group" aria-label="Explore data points" aria-describedby="keyboard-instructions">${data.map((item, index) => `<button class="bar-item ${index === state.selected ? "selected" : ""}" data-point="${index}" aria-label="${escape(item.label)}, ${formatValue(item.value, state.data)} ${escape(state.data.unit)}" aria-pressed="${index === state.selected}"><span class="bar-value">${formatValue(item.value, state.data)}</span><span class="bar" style="height:${Math.max(16, (Math.abs(item.value) / range) * 245)}px;--bar-index:${index}"></span><span class="bar-label">${escape(item.label)}</span></button>`).join("")}</div>
      <p id="player-status" class="playback-status" role="status" aria-live="polite">${escape(state.playerStatus)}</p>
    </section></div>
    <span id="selected-count" class="sr-only">${state.selected + 1} of ${data.length}</span><span id="selected-label" class="sr-only">${escape(point.label)}</span><span id="selected-value" class="sr-only">${formatValue(point.value, state.data)} ${escape(state.data.unit)}</span>
    <p id="keyboard-instructions" class="sr-only">${state.mode === "user" && !state.learnerPreview ? "This chart is focused automatically when Explore opens." : "Focus this chart to use keyboard controls."} Use Left and Right arrows to select the previous or next point. Press Enter to hear its exact label, displayed value, and unit. Press Space once to start voice input and again to stop and send your question.</p>
    <p id="selection-status" class="sr-only" role="status"></p>
  </section>`;
}
function learnerOverviewContent() {
  const title = state.material.title;
  return `<section class="learner-overview-screen"><h1 tabindex="-1" aria-label="${escape(title)}">${coloredTitle(title)}</h1><div class="learner-overview-card"><h2>Explore at your pace</h2><p>Ask the music note for an overview, or choose Explore in the steps to move through the chart.</p>${state.material.learningGoal ? `<p>Learning goal: ${escape(state.material.learningGoal)}</p>` : ""}</div></section>`;
}
function editorPreviewContent() {
  const data = state.data.data;
  const range = Math.max(...data.map((point) => Math.abs(point.value))) || 1;
  const point = data[state.selected];
  return `<section class="studio-screen"><h1 tabindex="-1">${escape(state.metadata.title || state.data.title)}</h1>
    ${rangeContent()}${aiAdvisorContent()}${metadataContent()}
    <div class="overview-panel" id="overview-text"><h2>Overview</h2><p>${escape(overviewText())}</p></div>
    <div class="chart-area creator-chart"><div class="chart-header"><h2>Chart to music</h2></div>
      ${keyboardHelp(false)}
      <div class="chart" id="explorer" tabindex="0" role="group" aria-label="Explore data points" aria-describedby="keyboard-instructions">${data.map((item, index) => `<button class="bar-item ${index === state.selected ? "selected" : ""}" data-point="${index}" aria-label="${escape(item.label)}, ${formatValue(item.value, state.data)} ${escape(state.data.unit)}" aria-pressed="${index === state.selected}"><span class="bar-value">${formatValue(item.value, state.data)}</span><span class="bar" style="height:${Math.max(16, (Math.abs(item.value) / range) * 245)}px;--bar-index:${index}"></span><span class="bar-label">${escape(item.label)}</span></button>`).join("")}</div>
      <p id="player-status" class="playback-status" role="status" aria-live="polite">${escape(state.playerStatus)}</p>
    </div>
    <span id="selected-count" class="sr-only">${state.selected + 1} of ${data.length}</span><span id="selected-label" class="sr-only">${escape(point.label)}</span><span id="selected-value" class="sr-only">${formatValue(point.value, state.data)} ${escape(state.data.unit)}</span>
    <p id="keyboard-instructions" class="sr-only">Focus this chart to use keyboard controls. Use Left and Right arrows to select the previous or next point. Press Enter to hear its exact label, displayed value, and unit. Press Space once to start voice input and again to stop and send your question.</p><p id="selection-status" class="sr-only" role="status"></p>
    <div class="preview-actions"><button id="preview-learner">Preview as learner</button><button id="review-publish" class="button">Continue to publish</button></div>
  </section>`;
}
function content() {
  if (state.view === "archive") return archiveContent();
  if (state.step === 0)
    return `<section class="hero"><h1 tabindex="-1">Data Shouldn't Have to Be Seen <br><em>to Be Understood.</em></h1><div class="wave" aria-hidden="true">${[24, 40, 32, 62, 85, 53, 107, 137, 87, 60, 99, 153, 121, 76, 48, 84, 112, 69, 42, 58, 31, 46, 22].map((h, i) => `<i style="height:${h}px;--n:${i}"></i>`).join("")}</div><div class="cards"><button class="mode primary-card" id="creator"><span class="card-icon" aria-hidden="true">▥</span><h2>${state.dirty ? "Continue draft" : "Creator Mode"}</h2><p>${state.dirty ? "Return to your work in this tab." : "Prepare charts for learning."}</p></button><button class="mode" id="user"><span class="card-icon" aria-hidden="true">♫</span><h2>User Mode</h2><p>Explore prepared charts with sound.</p></button></div></section>`;
  if (state.mode === "user" && state.step === 1) return libraryContent();
  if (state.mode === "user" && state.step === 2)
    return learnerOverviewContent();
  if ((state.mode === "user" && state.step === 3) || state.learnerPreview)
    return learnerContent();
  if (state.mode === "creator" && state.step === 5) return codeContent();
  if (state.mode === "creator" && state.step === 4) return publishContent();
  if (state.step === 1)
    return `<section class="upload-screen"><h1 tabindex="-1">What shall we explore today?</h1><div class="upload-paper"><div class="upload-main"><div class="upload-action"><div class="upload-symbol" aria-hidden="true"><svg viewBox="0 0 72 72" role="presentation"><path d="M28 45 43 18c5-7 12-10 19-9 1 7-2 14-9 19L27 44z" fill="currentColor"/><circle cx="48" cy="23" r="5" fill="#d1e5f0"/><path d="m27 44-8 3-5 11 11-5 3-8M30 35l-11-1-7 7 14 2M38 43l2 14 7-7-1-11" fill="#ef8a62"/><path d="M13 57c-3 2-4 5-4 8 4 0 7-2 9-5" fill="#ef8a62"/></svg></div><label class="button" for="file">Choose a CSV/Excel file</label><input id="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div></div></div></section>`;
  if (state.step === 2) return mappingContent();
  return editorPreviewContent();
}
function bind() {
  const on = (id, fn) => {
    const e = document.getElementById(id);
    if (e) e.onclick = fn;
  };
  on("archive-toggle", () =>
    state.view === "archive" ? closeArchive() : openArchive(),
  );
  on("archive-create", enterCreator);
  on("resume-current-draft", closeArchive);
  document.querySelectorAll("[data-resume-draft]").forEach((button) => {
    button.onclick = () =>
      resumeParkedDraft(Number(button.dataset.resumeDraft));
  });
  const archiveItems = [...state.library].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  document.querySelectorAll("[data-review-archive]").forEach((button) => {
    button.onclick = () =>
      reviewArchiveMaterial(archiveItems[Number(button.dataset.reviewArchive)]);
  });
  document.querySelectorAll("[data-learn-archive]").forEach((button) => {
    button.onclick = () => {
      const lesson = archiveLesson(
        archiveItems[Number(button.dataset.learnArchive)],
      );
      if (!lesson) return;
      state.view = null;
      state.mode = "user";
      state.account = { id: "learner", name: "Learner", role: "user" };
      state.learnerPreview = false;
      rememberLesson(lesson);
      state.musicStyle = lesson.style;
      openMaterial(lesson.material);
    };
  });
  document.querySelectorAll("[data-nav-step]").forEach((button) => {
    button.onclick = () => {
      const target = Number(button.dataset.navStep);
      if (state.mode === "creator") {
        state.learnerPreview = false;
        go(target);
      } else if (target === 1) {
        go(1);
      } else if (state.unlocked) {
        if (!state.material) openMaterial(state.unlocked.material);
        if (target !== state.step) go(target);
      }
    };
  });
  on("creator", enterCreator);
  on("user", () => enterUser(false));
  on("back-home", home);
  bindMaterials(on);
  on("preview-learner", () => {
    stopAll();
    state.previewReturn = state.step;
    state.learnerPreview = true;
    state.step = 3;
    render();
    assistant.welcome(state.metadata.title || state.data.title);
    focusTitle();
  });
  on("review-publish", () => {
    if (!state.metadata.title.trim()) {
      state.error = "Enter a title before publishing.";
      render();
      document.querySelector("#material-title")?.focus();
    } else go(4);
  });
  for (const key of ["title", "description", "learningGoal"]) {
    const el = document.querySelector(`[data-metadata="${key}"]`);
    if (el)
      el.oninput = () => {
        stopAll();
        state.metadata[key] = el.value;
        if (key === "title")
          document.querySelector("h1").textContent =
            el.value || state.data.title;
        state.dirty = true;
        const draftStatus = document.querySelector("#draft-status");
        if (draftStatus)
          draftStatus.textContent =
            "Unpublished changes. Draft kept in this tab while switching modes; reload closes the draft.";
      };
  }
  on("back", () => {
    if (state.mode === "user") {
      emitGuidance("contextExited");
      go(1);
    } else if (state.learnerPreview) {
      stopAll();
      state.learnerPreview = false;
      state.step = state.previewReturn;
      render();
      focusTitle();
    } else if (state.step === 1) home();
    else go(state.step - 1);
  });
  on("editMapping", () => {
    invalidate();
    render();
    document.querySelector("h1")?.focus();
  });
  const handleSelectedFile = async (selectedFile) => {
    if (!selectedFile) return;
    const generation = ++importGeneration;
    try {
      stopAll();
      const sheets = await parseFile(selectedFile);
      if (generation !== importGeneration || state.mode !== "creator") return;
      parkCurrentDraft();
      loadSheets(sheets, selectedFile.name);
    } catch (error) {
      if (generation !== importGeneration || state.mode !== "creator") return;
      state.error = error.message;
      render();
    }
  };
  const file = document.querySelector("#file");
  if (file) file.onchange = () => handleSelectedFile(file.files[0]);
  const dropZone = document.querySelector(".upload-paper");
  if (dropZone) {
    dropZone.ondragover = (event) => {
      event.preventDefault();
      dropZone.classList.add("drag-over");
    };
    dropZone.ondragleave = () => dropZone.classList.remove("drag-over");
    dropZone.ondrop = (event) => {
      event.preventDefault();
      dropZone.classList.remove("drag-over");
      handleSelectedFile(event.dataTransfer?.files?.[0]);
    };
  }
  for (const key of [
    "x",
    "y",
    "aggregation",
    "noUnit",
    "unit",
    "decimalPlaces",
  ]) {
    const el = document.getElementById(key);
    if (!el) continue;
    const update = () => {
      invalidate();
      state[key] =
        key === "noUnit"
          ? el.checked
          : key === "decimalPlaces"
            ? Number(el.value)
            : el.value;
      if (key !== "unit") {
        render();
        document.getElementById(key)?.focus();
      }
    };
    if (key === "unit")
      el.oninput = () => {
        const hadMapping = !!state.mapped;
        invalidate();
        state.unit = el.value;
        if (hadMapping) {
          render();
          const input = document.getElementById("unit");
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      };
    else el.onchange = update;
  }
  const sheet = document.getElementById("sheet");
  if (sheet)
    sheet.onchange = () => {
      try {
        chooseSheet(sheet.value);
      } catch (error) {
        state.error = error.message;
      }
      render();
      document.getElementById("sheet").focus();
    };
  on("explore", () => {
    try {
      state.error = "";
      buildMapping();
    } catch (error) {
      state.error = error.message;
      render();
    }
  });
  for (const [id, key] of [
    ["rangeStart", "start"],
    ["rangeEnd", "end"],
  ]) {
    const input = document.getElementById(id);
    if (input)
      input.oninput = () => {
        stopAll();
        state.selected = 0;
        state[key] = input.value;
      };
  }
  on("applyRange", () => {
    try {
      openExplorer(Number(state.start), Number(state.end));
    } catch (error) {
      state.error = error.message;
      render();
    }
  });
  const aiSettings = document.querySelector(".ai-settings");
  if (aiSettings)
    aiSettings.ontoggle = () => {
      state.aiSettingsOpen = aiSettings.open;
    };
  const mappingSelect = document.getElementById("ai-mapping");
  if (mappingSelect)
    mappingSelect.onchange = () => {
      stopAll();
      state.aiManualOverride = true;
      state.aiSettingsOpen = true;
      state.soundMapping = mappingSelect.value;
      playback.mapping = state.soundMapping;
      state.aiStatus = "Your sound choice is ready to play.";
      render();
      document.getElementById("ai-mapping")?.focus();
    };
  on("ai-apply", () => {
    if (!state.aiRecommendation || !state.data) return;
    stopAll();
    state.aiManualOverride = false;
    state.soundMapping = state.aiRecommendation.mapping;
    playback.mapping = state.soundMapping;
    state.musicStyle = state.aiRecommendation.style;
    state.aiStatus = "AI sound choice is ready to play.";
    render();
    document.getElementById("ai-mapping")?.focus();
  });
  on("play-music", () => {
    if (
      playback.kind === "music" &&
      ["playing", "paused"].includes(playback.engine.status)
    )
      playback.toggle(state.data);
    else playback.music(state.data, state.musicStyle);
  });
  on("play", () => playback.music(state.data, state.musicStyle));
  on("pause-music", () => {
    if (playback.canPause) playback.toggle(state.data);
  });
  on("single", () => playback.point(state.selected, state.data));
  on("read-value", () => {
    if (state.mode === "user" && state.playbackState === "speaking") stopAll();
    else readPoint();
  });
  on("previous", () => selectPoint(Math.max(0, state.selected - 1)));
  on("next", () =>
    selectPoint(Math.min(state.data.data.length - 1, state.selected + 1)),
  );
  on("first", () => selectPoint(0));
  on("last", () => selectPoint(state.data.data.length - 1));
  on("focus-explore", () => {
    document.querySelector("#explorer").focus();
    if (state.mode === "user") {
      const items = document.querySelectorAll("nav li");
      items.forEach((el) => el.removeAttribute("aria-current"));
      items[2]?.setAttribute("aria-current", "step");
    }
  });
  on("overview", () => {
    stopAll();
    const overview = document.querySelector("#overview-text");
    overview.tabIndex = -1;
    overview.focus();
    if (state.mode === "user") {
      const items = document.querySelectorAll("nav li");
      items.forEach((el) => el.removeAttribute("aria-current"));
      items[1]?.setAttribute("aria-current", "step");
    }
    emitGuidance("overviewRequested");
  });
  const style = document.querySelector("#music-style");
  if (style)
    style.onchange = () => {
      stopAll();
      state.musicStyle = style.value;
      state.aiManualOverride = true;
      state.aiSettingsOpen = true;
      state.aiStatus = "Your music choice is ready to play.";
      render();
      document.getElementById("music-style")?.focus();
    };
  document.querySelectorAll("[data-point]").forEach((el) => {
    el.onclick = () => selectPoint(Number(el.dataset.point));
  });
}

document.addEventListener("keydown", handleChartKeydown, true);
refreshLibrary();
render();
assistant.welcomeMode("home");
