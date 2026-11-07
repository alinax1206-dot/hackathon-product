import {
  DEFAULT_DECIMAL_PLACES,
  MAX_DECIMAL_PLACES,
  formatValue,
} from "./format-value.js";
import { parseFile, parseCSV, prepareTable } from "./import-data.js";
import {
  MAX_EXPLORATION_POINTS,
  mapColumns,
  recommendValue,
  selectRange,
  rangeDescription,
  aggregationLabels,
} from "./mapping.js";
import "./style.css";
import { Playback } from "./playback.js";
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

const sample =
  "City,Rainfall\nSeattle,95\nPortland,78\nBoston,65\nAustin,42\nDenver,28";
const state = {
  step: 0,
  rows: [],
  fields: [],
  x: "",
  y: "",
  data: null,
  selected: 0,
  mode: null,
  creatorStep: 1,
  creatorData: null,
  metadata: { title: "", description: "", learningGoal: "" },
  published: null,
  material: null,
  library: [],
  libraryError: "",
  dirty: false,
  learnerPreview: false,
  previewReturn: 3,
  letterKeys: true,
  notice: "",
  playbackState: "stopped",
  file: "",
  error: "",
  sheets: [],
  sheet: "",
  aggregation: "none",
  unit: "",
  decimalPlaces: DEFAULT_DECIMAL_PLACES,
  noUnit: false,
  mapped: null,
  start: "",
  end: "",
  musicStyle: "acoustic",
  playerStatus: "Ready to play.",
};
let importGeneration = 0;
const playback = new Playback({
  onPoint: (index) => {
    state.selected = index;
    updateSelectedPoint();
    emitGuidance("pointSelected");
  },
  onStatus: (message) => {
    state.playerStatus = message;
    state.playbackState =
      message === "Reading exact value."
        ? "speaking"
        : message.includes("paused")
          ? "paused"
          : message.startsWith("Playing")
            ? "playing"
            : message.startsWith("Loading")
              ? "loading"
              : "stopped";
    const live = document.querySelector("#player-status");
    if (live) live.textContent = message;
    updatePlaybackButtons();
    emitGuidance("playbackChanged");
  },
  onError: (message) => {
    state.playerStatus = message;
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
  if (dataButton) dataButton.textContent = playback.dataLabel(state.data);
  const pauseButton = document.querySelector("#pause-music");
  if (pauseButton) {
    pauseButton.textContent = playback.pauseLabel;
    pauseButton.disabled = !playback.canPause;
  }
  if (musicButton) {
    musicButton.textContent = playback.musicLabel;
    musicButton.disabled =
      playback.kind === "music" && playback.engine.status === "loading";
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
    count.textContent = `SELECTED POINT ${state.selected + 1} / ${state.data.data.length}`;
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
}
function readPoint() {
  const p = state.data.data[state.selected];
  playback.speak(
    `${p.label}, ${formatValue(p.value, state.data)} ${state.data.unit}.`,
    true,
  );
}
function selectPoint(index) {
  stopAll();
  state.selected = index;
  updateSelectedPoint();
  emitGuidance("pointSelected");
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
  if (state.step === 3 && step !== 3) emitGuidance("contextExited");
  stopAll();
  state.step = step;
  state.error = "";
  state.notice = "";
  if (state.mode === "creator") state.creatorStep = step;
  render();
  focusTitle();
}
function home() {
  importGeneration++;
  stopAll();
  emitGuidance("contextExited");
  if (state.mode === "creator") {
    state.creatorStep = state.learnerPreview ? state.previewReturn : state.step;
    state.creatorData = state.data;
  }
  state.mode = null;
  state.data = null;
  state.material = null;
  state.learnerPreview = false;
  state.step = 0;
  state.error = "";
  state.notice = "";
  render();
  focusTitle();
}
function enterCreator() {
  stopAll();
  state.mode = "creator";
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
function enterUser() {
  if (state.mode === "creator") {
    state.creatorStep = state.learnerPreview ? state.previewReturn : state.step;
    state.creatorData = state.data;
  }
  stopAll();
  state.mode = "user";
  state.data = null;
  state.material = null;
  state.learnerPreview = false;
  refreshLibrary();
  go(1);
  emitGuidance("modeEntered");
}
function openMaterial(material) {
  stopAll();
  emitGuidance("contextExited");
  state.material = validateMaterial(material);
  state.data = structuredClone(state.material.dataset);
  state.selected = 0;
  go(3);
  emitGuidance("materialOpened");
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
  state.aggregation = "none";
  state.unit = "";
  state.decimalPlaces = DEFAULT_DECIMAL_PLACES;
  state.noUnit = false;
  if (!name) return;
  const prepared = prepareTable(
    state.sheets.find((s) => s.name === name).table,
  );
  Object.assign(state, prepared);
  state.x = state.fields[0];
  state.y = recommendValue(state.fields, state.rows, state.x);
}
function loadSheets(sheets, name) {
  invalidate();
  state.sheets = sheets;
  state.file = name;
  state.metadata.title = name.replace(/\.(csv|xlsx)$/i, "");
  state.sheet = "";
  state.rows = [];
  state.fields = [];
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
  state.mapped = mapColumns(state.rows, {
    ...state,
    title: state.file.replace(/\.(csv|xlsx)$/i, ""),
  });
  if (state.mapped.totalPoints <= MAX_EXPLORATION_POINTS)
    openExplorer(1, state.mapped.totalPoints);
  else render();
}
function openExplorer(start, end) {
  stopAll();
  state.data = selectRange(state.mapped, start, end);
  state.selected = 0;
  state.creatorData = state.data;
  go(3);
}
function mappingContent() {
  if (state.mapped && state.mapped.totalPoints > MAX_EXPLORATION_POINTS) {
    return `<section class="mapping-screen range-screen"><h1 tabindex="-1">Choose an exploration range</h1>
      <p>${state.mapped.importedRows} imported rows · ${state.mapped.totalPoints} mapped points. Choose ${MAX_EXPLORATION_POINTS} or fewer continuous points before playback. No range has been selected yet.</p>
      <div class="panel"><div class="mapping"><label>First point (inclusive)<input id="rangeStart" type="number" min="1" max="${state.mapped.totalPoints}" value="${escape(state.start)}"></label><label>Last point (inclusive)<input id="rangeEnd" type="number" min="1" max="${state.mapped.totalPoints}" value="${escape(state.end)}"></label></div>
      <button id="applyRange" class="button">Explore selected range</button></div>
      <div class="actions"><button id="editMapping" type="button">← Edit mapping</button><button id="back" type="button">← Upload</button></div></section>`;
  }
  const options = (selected) =>
    '<option value="">Choose a column</option>' +
    state.fields
      .map(
        (f) =>
          `<option value="${escape(f)}" ${f === selected ? "selected" : ""}>${escape(f)}</option>`,
      )
      .join("");
  return `<section class="mapping-screen"><h1 tabindex="-1">Map your data</h1>
    <p>Original tables are kept separately. Mapping creates a new dataset without sorting or grouping dates.</p>
    <div class="panel"><p>${escape(state.file)} · ${state.rows.length} imported rows in selected worksheet</p>
    <label for="sheet">Worksheet</label><select id="sheet"><option value="">Choose a worksheet</option>${state.sheets.map((s) => `<option value="${escape(s.name)}" ${s.name === state.sheet ? "selected" : ""}>${escape(s.name)}</option>`).join("")}</select>
    ${
      state.fields.length
        ? `<div class="mapping">
    <label>What do you want to compare?<small>Choose a category or time column.</small><select id="x">${options(state.x)}</select></label>
    <label>What value do you want to hear?<small>${state.aggregation === "count" ? "Not needed for Count." : "Identifier and date columns are not recommended automatically. You can select them manually."}</small><select id="y" ${state.aggregation === "count" ? "disabled" : ""}>${options(state.y)}</select></label>
    <div class="unit-field"><div class="unit-heading"><label for="unit">Unit</label><label class="no-unit-option"><input id="noUnit" type="checkbox" ${state.noUnit ? "checked" : ""} ${state.aggregation === "count" ? "disabled" : ""}> No unit</label></div><input id="unit" type="text" value="${escape(state.aggregation === "count" ? "records" : state.unit)}" ${state.aggregation === "count" || state.noUnit ? "disabled" : ""}></div>
    <label>Decimal places<small>Display and speech only; calculations and sound keep full precision. Count uses whole numbers.</small><select id="decimalPlaces" ${state.aggregation === "count" ? "disabled" : ""}>${Array.from({ length: MAX_DECIMAL_PLACES + 1 }, (_, places) => `<option value="${places}" ${places === (state.aggregation === "count" ? 0 : state.decimalPlaces) ? "selected" : ""}>${places}</option>`).join("")}</select></label>
    <label>When a category has multiple records, how should they be handled?<select id="aggregation">${Object.entries(
      aggregationLabels,
    )
      .map(
        ([value, label]) =>
          `<option value="${value}" ${state.aggregation === value ? "selected" : ""}>${label}</option>`,
      )
      .join("")}</select></label></div>
    <button class="button" id="explore">Validate mapping and continue</button><details class="preview-details"><summary>Original table preview</summary><div class="table-wrap"><table><caption>First five imported rows; source row 1 contains headers.</caption><thead><tr>${state.fields.map((f) => `<th scope="col">${escape(f)}</th>`).join("")}</tr></thead><tbody>${state.rows
      .slice(0, 5)
      .map(
        (r) =>
          `<tr>${state.fields.map((f) => `<td>${escape(r[f] ?? "")}</td>`).join("")}</tr>`,
      )
      .join("")}</tbody></table></div>
    </details>`
        : ""
    }
    </div><div class="actions"><button id="back">← Back</button></div></section>`;
}
const logo = `<img class="brand-logo" src="/brand/figurewalk-logo-transparent.png" alt="" width="130" height="98">`;
const mascot = `<img class="mascot" src="/brand/figurewalk-character-transparent.png" alt="" width="532" height="576">`;
function metadataContent() {
  return `<div class="panel material-metadata"><h2>Learning material details</h2><div class="mapping"><label>Title (required)<input id="material-title" data-metadata="title" required maxlength="10000" value="${escape(state.metadata.title)}"></label><label>Short description (optional)<input data-metadata="description" maxlength="10000" value="${escape(state.metadata.description)}"></label><label>Learning goal (optional)<input data-metadata="learningGoal" maxlength="10000" value="${escape(state.metadata.learningGoal)}"></label></div><p id="draft-status">${state.dirty ? "Unpublished changes. Draft kept in this tab while switching modes; reload closes the draft." : "This draft matches the last published revision."}</p></div>`;
}
function overviewText() {
  const s = summary(),
    d = state.data;
  return `${d.yAxis} by ${d.xAxis}. Unit: ${d.unit || "No unit"}. ${s.count} selected data points. ${aggregationLabels[d.aggregation]}. ${rangeDescription(d)} Highest is ${s.hi.label}, ${formatValue(s.hi.value, d)} ${d.unit}. Lowest is ${s.lo.label}, ${formatValue(s.lo.value, d)} ${d.unit}.`;
}
function libraryContent() {
  return `<section class="materials-screen"><h1 tabindex="-1">Learning materials</h1><p>Choose a prepared chart. No spreadsheet upload or mapping is needed.</p><p>Saved in this browser. Materials do not automatically appear on other devices. Export and import JSON to transfer them.</p>${state.libraryError ? `<div role="alert" class="error">${escape(state.libraryError)}</div><button id="retry-library">Retry local library</button>` : ""}${!state.library.length ? '<p class="notice">No saved materials yet. Open Sample or import a learning material JSON file to begin.</p>' : ""}<div class="material-list">${[...state.library, SAMPLE_MATERIAL].map((m, i) => `<article class="panel"><h2>${escape(m.title)}</h2><p>${escape(m.description)}</p><p>${m.id === SAMPLE_MATERIAL.id ? "Built-in Sample" : "Saved in this browser"} · Revision ${m.revision}</p><div class="actions"><button data-open-material="${i}" aria-label="Open ${escape(m.title)} revision ${m.revision}">Open material</button><button data-export-material="${i}" aria-label="Export ${escape(m.title)} revision ${m.revision}">Export JSON</button></div></article>`).join("")}</div><div class="panel"><label for="material-file">Import learning material JSON</label><input id="material-file" type="file" accept=".json,application/json"><p>Choose a JSON file exported by ChartAloud (up to 2 MB).</p></div></section>`;
}
function publishContent() {
  return `<section class="publish-screen"><h1 tabindex="-1">Publish learning material</h1><div class="panel"><h2>${escape(state.metadata.title)}</h2><p>${escape(state.metadata.description)}</p>${state.metadata.learningGoal ? `<p>Learning goal: ${escape(state.metadata.learningGoal)}</p>` : ""}<p>${escape(overviewText())}</p><p>Saved in this browser. Export JSON after publishing to give the material to a learner on another device.</p><p>${state.dirty ? "Unpublished changes" : "No unpublished changes"}${state.published ? ` · Last saved revision ${state.published.revision}` : ""}</p><div class="actions"><button id="publish" class="button">Publish learning material</button><button id="export-draft">Export draft as material JSON</button>${state.published ? '<button id="export-published">Export published JSON</button>' : ""}</div></div><div class="actions"><button id="back">Back to preview</button><button id="preview-learner">Preview as learner</button><button id="switch-user">Open User Mode</button>${state.published && !state.dirty ? '<button id="new-material">Start another material</button>' : ""}</div></section>`;
}
function bindMaterials(on) {
  const materials = [...state.library, SAMPLE_MATERIAL];
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
  on("switch-user", enterUser);
  on("new-material", () => {
    stopAll();
    state.published = null;
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
      state.published = material;
      state.dirty = false;
      state.error = "";
      state.libraryError = "";
      state.notice = `Published revision ${material.revision}. Saved in this browser.`;
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

function render() {
  document.querySelector("#app").innerHTML =
    `<a class="skip" href="#main">Skip to content</a><header><a href="#" class="brand" id="home">${logo}<span class="brand-words"><strong>ChartAloud</strong><small>STUDIO</small></span></a><div class="settings"><button id="contrast" aria-pressed="${document.body.classList.contains("contrast")}">◐ <span>High contrast</span></button><span class="guidance-soon">Audio guidance · Coming soon</span></div></header><div class="layout ${!state.mode ? "home-layout" : ""}"><aside><nav aria-label="${state.mode === "creator" ? "Creator" : "User"} progress" ${!state.mode ? "hidden" : ""}><ol>${(state.mode === "creator" ? ["Import", "Map", "Preview", "Publish"] : state.mode === "user" ? ["Materials", "Overview", "Explore"] : []).map((s, i) => `<li ${i === (state.mode === "creator" ? state.step - 1 : state.step === 1 ? 0 : 2) ? 'aria-current="step"' : ""}><span class="stepnum">${i < (state.mode === "creator" ? state.step - 1 : state.step === 1 ? 0 : 2) ? "✓" : String(i + 1).padStart(2, "0")}</span><span>${s}</span></li>`).join("")}</ol></nav><div class="mascot-wrap">${mascot}</div></aside><main id="main">${state.error ? `<div role="alert" class="error">${escape(state.error)}</div>` : ""}${state.notice ? `<p role="status" class="notice">${escape(state.notice)}</p>` : ""}${content()}${state.mode ? `<div class="actions"><button id="back-home">Back to home</button></div>` : ""}<footer><span>ChartAloud Studio · Your data stays in this browser.</span></footer></main></div>`;
  document.querySelector("#home").onclick = (e) => {
    e.preventDefault();
    home();
  };
  document.querySelector("#contrast").onclick = () => {
    document.body.classList.toggle("contrast");
    const focused = document.activeElement?.id;
    render();
    document.getElementById(focused)?.focus();
  };
  bind();
}
function content() {
  if (state.step === 0)
    return `<section class="hero"><div class="eyebrow">LISTEN. EXPLORE. UNDERSTAND.</div><h1 tabindex="-1">Hear the<br><em>bigger picture.</em></h1><p class="intro">Prepare a chart for learning, or explore prepared materials with sound.</p><div class="wave" aria-hidden="true">${[24, 40, 32, 62, 85, 53, 107, 137, 87, 60, 99, 153, 121, 76, 48, 84, 112, 69, 42, 58, 31, 46, 22].map((h, i) => `<i style="height:${h}px;--n:${i}"></i>`).join("")}</div><div class="cards"><button class="mode primary-card" id="creator"><span class="card-icon" aria-hidden="true">▥</span><h2>Creator Mode</h2><p>Prepare charts for learning.</p></button><button class="mode" id="user"><span class="card-icon" aria-hidden="true">♫</span><h2>User Mode</h2><p>Explore prepared charts with sound.</p></button></div>${state.dirty ? '<p class="notice">You have unpublished changes. Your draft is kept while switching modes in this tab.</p>' : ""}<p class="privacy">Saved in this browser. Export a learning material JSON file to use it on another device.</p></section>`;
  if (state.mode === "user" && state.step === 1) return libraryContent();
  if (state.mode === "creator" && state.step === 4) return publishContent();
  if (state.step === 1)
    return `<section class="upload-screen"><h1 tabindex="-1">What shall we explore today?</h1><div class="upload-paper"><div class="paper-tab">01 · Bring your data</div><div class="upload-main"><div class="upload-action"><div class="upload-symbol" aria-hidden="true">↥</div><h2>Drop a CSV or Excel file</h2><p>Choose a spreadsheet with column headers. Files stay in your browser.</p><label class="button" for="file">Choose a file</label><input id="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"><button id="sample" class="text-button">Or try a sample →</button></div></div><div class="sticky-note" aria-hidden="true">${logo}<strong>Let's find<br>the patterns.</strong></div><div class="upload-steps" aria-label="Steps"><span>↥ &nbsp; Upload</span><span aria-hidden="true">→</span><span>▥ &nbsp; Map</span><span aria-hidden="true">→</span><span>♫ &nbsp; Listen</span></div></div><div class="actions"><button id="back">← Back</button></div></section>`;
  if (state.step === 2) return mappingContent();
  const s = summary(),
    d = state.data.data,
    point = d[state.selected],
    range = Math.max(...d.map((p) => Math.abs(p.value))) || 1,
    lesson = state.mode === "user" ? state.material : state.metadata;
  return `<section class="studio-screen"><h1 tabindex="-1">${escape(state.mode === "user" ? state.material.title : state.metadata.title || state.data.title)}</h1>${state.mode === "creator" && !state.learnerPreview ? metadataContent() : ""}${state.learnerPreview ? '<p class="notice">Preview as learner · Unpublished draft</p>' : ""}${state.mode === "user" || state.learnerPreview ? `<p>${escape(lesson.description)}</p>${lesson.learningGoal ? `<p>Learning goal: ${escape(lesson.learningGoal)}</p>` : ""}` : ""}<p class="intro">${escape(rangeDescription(state.data))} · ${escape(aggregationLabels[state.data.aggregation])} · ${escape(state.data.yAxis)} by ${escape(state.data.xAxis)}</p><div class="overview-panel" id="overview-text"><h2>Overview</h2><p>${escape(overviewText())}</p></div><div class="studio-grid"><div class="chart-area"><div class="chart-header"><h2>Chart to music</h2><button id="overview">Show overview</button></div><div class="chart" id="explorer" tabindex="0" role="group" aria-label="Explore data points" aria-describedby="keyboard-instructions">${d.map((p, i) => `<button class="bar-item ${i === state.selected ? "selected" : ""}" data-point="${i}" aria-label="${escape(p.label)}, ${formatValue(p.value, state.data)} ${escape(state.data.unit)}" aria-pressed="${i === state.selected}" aria-describedby="point-button-help"><span class="bar-value">${formatValue(p.value, state.data)}</span><span class="bar" style="height:${Math.max(16, (Math.abs(p.value) / range) * 245)}px;--bar-index:${i}"></span><span class="bar-label">${escape(p.label)}</span></button>`).join("")}</div><div class="music-player"><button class="button play-button" id="play">${playback.dataLabel(state.data)}</button><button class="button" id="play-music">${playback.musicLabel}</button><button id="pause-music" type="button" ${playback.canPause ? "" : "disabled"}>${playback.pauseLabel}</button><label>Music style <select id="music-style">${Object.entries(
    STYLES,
  )
    .map(
      ([key, value]) =>
        `<option value="${key}" ${key === state.musicStyle ? "selected" : ""}>${escape(value.name)}</option>`,
    )
    .join(
      "",
    )}</select></label><p id="player-status" role="status" aria-live="polite">${escape(state.playerStatus)}</p></div></div><div class="point-side"><div class="point-detail"><span id="selected-count">SELECTED POINT ${state.selected + 1} / ${d.length}</span><strong><span id="selected-label">${escape(point.label)}</span> <em id="selected-value">${formatValue(point.value, state.data)} ${escape(state.data.unit)}</em></strong><button id="single">♪ Play this point</button><button id="read-value">Read exact value</button><div class="actions"><button id="previous">Previous point</button><button id="next">Next point</button><button id="first">First point</button><button id="last">Last point</button></div></div><div class="stat-note stats"><strong>Pattern at a glance</strong><p>${escape(s.hi.label)} is highest at ${formatValue(s.hi.value, state.data)} ${escape(state.data.unit)}. ${escape(s.lo.label)} is lowest at ${formatValue(s.lo.value, state.data)} ${escape(state.data.unit)}.</p></div></div></div><p id="selection-status" class="sr-only" role="status"></p><p class="keyboard-hint" id="keyboard-instructions">Focus the exploration area: Left / Right select a point; Home / End select the first / last point; Enter reads its exact value; R plays its pitch; Space plays or pauses the sequence. Escape stops audio and value reading.</p><p class="keyboard-hint" id="point-button-help">Data point buttons select a point. Use the exploration area or the equivalent buttons to read a value or play a note.</p><label class="letter-option"><input id="letter-keys" type="checkbox" ${state.letterKeys ? "checked" : ""}> Enable R shortcut in the exploration area</label><div class="actions"><button id="focus-explore">Focus exploration area</button><button id="back">${state.mode === "user" ? "Back to materials" : state.learnerPreview ? "Back to preview" : "Edit mapping"}</button>${state.mode === "creator" && !state.learnerPreview ? '<button id="preview-learner">Preview as learner</button><button id="review-publish" class="button">Review and publish</button>' : ""}${state.mode === "user" ? '<button id="export-current">Export material JSON</button>' : ""}</div></section>`;
}
function bind() {
  const on = (id, fn) => {
    const e = document.getElementById(id);
    if (e) e.onclick = fn;
  };
  on("creator", enterCreator);
  on("user", enterUser);
  on("back-home", home);
  bindMaterials(on);
  on("preview-learner", () => {
    stopAll();
    state.previewReturn = state.step;
    state.learnerPreview = true;
    state.step = 3;
    render();
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
  on("sample", () =>
    loadSheets(
      [{ name: "CSV", table: parseCSV(sample) }],
      "Rainfall by City.csv",
    ),
  );
  on("back", () => {
    if (state.mode === "user") {
      emitGuidance("contextExited");
      state.material = null;
      go(1);
      state.data = null;
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
        state.data = null;
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
  on("play-music", () => {
    if (
      playback.kind === "music" &&
      ["playing", "paused"].includes(playback.engine.status)
    )
      playback.toggle(state.data);
    else playback.music(state.data, state.musicStyle);
  });
  on("play", () => playback.sequence(state.data));
  on("pause-music", () => {
    if (playback.canPause) playback.toggle(state.data);
  });
  on("single", () => playback.point(state.selected, state.data));
  on("read-value", readPoint);
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
  const letter = document.querySelector("#letter-keys");
  if (letter)
    letter.onchange = () => {
      state.letterKeys = letter.checked;
    };
  const style = document.querySelector("#music-style");
  if (style)
    style.onchange = () => {
      stopAll();
      state.musicStyle = style.value;
    };
  document.querySelectorAll("[data-point]").forEach((el) => {
    el.onclick = () => selectPoint(Number(el.dataset.point));
  });
  const explorer = document.querySelector("#explorer");
  if (explorer)
    explorer.onkeydown = (e) => {
      if (
        e.target !== explorer ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.repeat
      )
        return;
      const keys = [
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
        "Enter",
        " ",
        ...(state.letterKeys ? ["r", "R"] : []),
      ];
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      if (e.key === "Enter") readPoint();
      else if (e.key.toLowerCase() === "r")
        playback.point(state.selected, state.data);
      else if (e.key === " ") playback.toggle(state.data);
      else
        selectPoint(
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? state.data.data.length - 1
              : Math.max(
                  0,
                  Math.min(
                    state.data.data.length - 1,
                    state.selected + (e.key === "ArrowRight" ? 1 : -1),
                  ),
                ),
        );
    };
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.mode && !e.altKey && !e.ctrlKey && !e.metaKey)
    stopAll();
});
refreshLibrary();
render();
