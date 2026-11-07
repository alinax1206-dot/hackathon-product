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
  voice: false,
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
};
const steps = ["Welcome", "Upload data", "Map columns", "Explore"];
let audio,
  nodes = [],
  timer;
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function speak(text) {
  stopAudio();
  speechSynthesis.cancel();
  if (state.voice) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    speechSynthesis.speak(utterance);
  }
}
function stopAudio() {
  clearTimeout(timer);
  nodes.forEach((n) => {
    try {
      n.stop();
    } catch {}
  });
  nodes = [];
}
function stopAll() {
  stopAudio();
  speechSynthesis.cancel();
}
function note(value, start = 0) {
  audio ??= new AudioContext();
  audio.resume();
  const values = state.data.data.map((d) => d.value),
    min = Math.min(...values),
    max = Math.max(...values);
  const scale = Math.max(Math.abs(min), Math.abs(max)) || 1;
  const pitch =
    max === min
      ? 0.5
      : (value / scale - min / scale) / (max / scale - min / scale);
  const osc = audio.createOscillator(),
    gain = audio.createGain(),
    at = audio.currentTime + start;
  osc.type = "sine";
  osc.frequency.value = 220 * 2 ** (pitch * 2);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.16, at + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.6);
  osc.connect(gain).connect(audio.destination);
  osc.start(at);
  osc.stop(at + 0.65);
  nodes.push(osc);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
    nodes = nodes.filter((n) => n !== osc);
  };
}
function summary() {
  const d = state.data.data;
  const hi = d.reduce((a, b) => (a.value >= b.value ? a : b)),
    lo = d.reduce((a, b) => (a.value <= b.value ? a : b));
  return { hi, lo, count: d.length };
}
function go(step) {
  stopAll();
  state.step = step;
  state.error = "";
  render();
  document.querySelector("h1").focus();
  speak(
    [
      "Welcome to FigureWalk.",
      "Upload a CSV or XLSX file, or try our sample.",
      "Choose your category and value columns.",
      `Explore your data. ${state.data ? rangeDescription(state.data) : ""} Use left and right arrows on the data point controls.`,
    ][step],
  );
}
function invalidate() {
  stopAll();
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
  go(3);
}
function mappingContent() {
  const options = (selected) =>
    '<option value="">Choose a column</option>' +
    state.fields
      .map(
        (f) =>
          `<option value="${escape(f)}" ${f === selected ? "selected" : ""}>${escape(f)}</option>`,
      )
      .join("");
  return `<section><h1 tabindex="-1">Map your data</h1>
    <p>Original tables are kept separately. Mapping creates a new dataset without sorting or grouping dates.</p>
    <div class="panel"><p>${escape(state.file)} · ${state.rows.length} imported rows in selected worksheet</p>
    <label for="sheet">Worksheet</label><select id="sheet"><option value="">Choose a worksheet</option>${state.sheets.map((s) => `<option value="${escape(s.name)}" ${s.name === state.sheet ? "selected" : ""}>${escape(s.name)}</option>`).join("")}</select>
    ${
      state.fields.length
        ? `<div class="mapping">
    <label>What do you want to compare?<small>Choose a category or time column.</small><select id="x">${options(state.x)}</select></label>
    <label>What value do you want to hear?<small>${state.aggregation === "count" ? "Not needed for Count." : "Identifier and date columns are not recommended automatically. You can select them manually."}</small><select id="y" ${state.aggregation === "count" ? "disabled" : ""}>${options(state.y)}</select></label>
    <label>Unit<input id="unit" type="text" value="${escape(state.aggregation === "count" ? "records" : state.unit)}" ${state.aggregation === "count" || state.noUnit ? "disabled" : ""}></label>
    <label><input id="noUnit" type="checkbox" ${state.noUnit ? "checked" : ""} ${state.aggregation === "count" ? "disabled" : ""}> No unit</label>
    <label>Decimal places<small>Display and speech only; calculations and sound keep full precision. Count uses whole numbers.</small><select id="decimalPlaces" ${state.aggregation === "count" ? "disabled" : ""}>${Array.from({ length: MAX_DECIMAL_PLACES + 1 }, (_, places) => `<option value="${places}" ${places === (state.aggregation === "count" ? 0 : state.decimalPlaces) ? "selected" : ""}>${places}</option>`).join("")}</select></label>
    <label>When a category has multiple records, how should they be handled?<select id="aggregation">${Object.entries(
      aggregationLabels,
    )
      .map(
        ([value, label]) =>
          `<option value="${value}" ${state.aggregation === value ? "selected" : ""}>${label}</option>`,
      )
      .join("")}</select></label></div>
    <h2>Original table preview</h2><div class="table-wrap"><table><caption>First five imported rows; source row 1 contains headers.</caption><thead><tr>${state.fields.map((f) => `<th scope="col">${escape(f)}</th>`).join("")}</tr></thead><tbody>${state.rows
      .slice(0, 5)
      .map(
        (r) =>
          `<tr>${state.fields.map((f) => `<td>${escape(r[f] ?? "")}</td>`).join("")}</tr>`,
      )
      .join("")}</tbody></table></div>
    <button class="button" id="explore">Validate mapping and continue</button>`
        : ""
    }
    ${state.mapped ? `<div role="status"><p>${state.mapped.importedRows} imported rows · ${state.mapped.totalPoints} mapped points.</p><p>More than ${MAX_EXPLORATION_POINTS} points. Choose a continuous range explicitly. No exploration range is selected yet.</p></div><div class="mapping"><label>First point (inclusive)<input id="rangeStart" type="number" min="1" max="${state.mapped.totalPoints}" value="${escape(state.start)}"></label><label>Last point (inclusive)<input id="rangeEnd" type="number" min="1" max="${state.mapped.totalPoints}" value="${escape(state.end)}"></label></div><button id="applyRange" class="button">Explore selected range</button>` : ""}
    </div><div class="actions"><button id="back">← Back</button></div></section>`;
}
function render() {
  document.querySelector("#app").innerHTML =
    `<a class="skip" href="#main">Skip to content</a><header><a href="#" class="brand" id="home"><span class="mark" aria-hidden="true">◒</span> FigureWalk<span class="beta">EARLY ACCESS</span></a><div class="settings"><button id="contrast" aria-pressed="${document.body.classList.contains("contrast")}">◐ <span>High contrast</span></button><button id="voice" aria-pressed="${state.voice}">◖ <span>Voice guidance ${state.voice ? "on" : "off"}</span></button></div></header><div class="layout"><aside><div class="eyebrow">YOUR DATA, ANOTHER DIMENSION</div><nav aria-label="Progress"><ol>${steps.map((s, i) => `<li ${i === state.step ? 'aria-current="step"' : ""}><span class="stepnum">${i < state.step ? "✓" : String(i + 1).padStart(2, "0")}</span><span>${s}</span>${i === state.step ? '<span class="dot"></span>' : ""}</li>`).join("")}</ol></nav><div class="aside-note"><span aria-hidden="true">⌨</span><p>Made for your keyboard.<br>Designed for your ears.</p><small>Tab to move · Enter to choose</small></div></aside><main id="main"><div class="topline"><span>FIGUREWALK / ${String(state.step + 1).padStart(2, "0")}</span><span>ACCESSIBLE BY DESIGN ↗</span></div>${state.error ? `<div role="alert" class="error">${escape(state.error)}</div>` : ""}${content()}<footer><span>A different way to see data.</span><span>Built with accessibility at heart <span aria-hidden="true">✳</span></span></footer></main></div>`;
  document.querySelector("#home").onclick = (e) => {
    e.preventDefault();
    go(0);
  };
  document.querySelector("#voice").onclick = () => {
    state.voice = !state.voice;
    render();
    if (state.voice) speak("Voice guidance enabled.");
    else speechSynthesis.cancel();
  };
  document.querySelector("#contrast").onclick = () => {
    document.body.classList.toggle("contrast");
    render();
  };
  bind();
}
function content() {
  if (state.step === 0)
    return `<section class="hero"><div class="eyebrow">LISTEN. EXPLORE. UNDERSTAND.</div><h1 tabindex="-1">Hear the<br><em>bigger picture.</em></h1><p class="intro">Turn your data into sound. Explore patterns, discover differences, and find your own way through a chart.</p><div class="wave" aria-hidden="true">${[24, 40, 32, 62, 85, 53, 107, 137, 87, 60, 99, 153, 121, 76, 48, 84, 112, 69, 42, 58, 31, 46, 22].map((h, i) => `<i style="height:${h}px;--n:${i}"></i>`).join("")}</div><div class="cards"><button class="mode primary-card" id="start"><span class="card-icon">◉</span><span class="eyebrow">EXPLORE WITH SOUND</span><h2>Start your walk <span>↗</span></h2><p>Bring a dataset. We'll help you hear it.</p><span class="card-bottom">Upload your data <b>→</b></span></button><button class="mode" id="sample"><span class="card-icon">✳</span><span class="eyebrow">A LITTLE CURIOUS?</span><h2>Try a sample <span>↗</span></h2><p>No file needed. Explore rainfall by city.</p><span class="card-bottom">Take a quick tour <b>→</b></span></button></div><p class="privacy">↳ Your file is processed in this browser. No upload to a server.</p></section>`;
  if (state.step === 1)
    return `<section><div class="eyebrow">01 / BRING YOUR DATA</div><h1 tabindex="-1">Every dataset<br>has a <em>story.</em></h1><p class="intro">Start with a CSV or XLSX file. One column for categories, another for numbers.</p><div class="upload"><span aria-hidden="true">↥</span><h2>Choose your dataset</h2><p>CSV or XLSX with column headers · One data series</p><label class="button" for="file">Choose CSV or XLSX file</label><input id="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"><p class="muted">Example columns: City, Rainfall</p></div><button id="sample" class="text-button">Or explore our sample dataset →</button><div class="actions"><button id="back">← Back</button></div></section>`;
  if (state.step === 2) return mappingContent();
  const s = summary(),
    d = state.data.data,
    point = d[state.selected],
    range = Math.max(...d.map((p) => Math.abs(p.value))) || 1;
  return `<section><div class="eyebrow">03 / YOUR AUDIO EXPLORER</div><h1 tabindex="-1">Meet your data.<br><em>One note at a time.</em></h1><p class="intro">${escape(rangeDescription(state.data))} ${escape(aggregationLabels[state.data.aggregation])}. ${escape(state.data.yAxis)} by ${escape(state.data.xAxis)}. Higher values play higher notes.</p><div class="stats"><div><small>DATA POINTS</small><strong>${s.count}</strong></div><div><small>HIGHEST · ${escape(s.hi.label)}</small><strong>${formatValue(s.hi.value, state.data)}</strong></div><div><small>LOWEST · ${escape(s.lo.label)}</small><strong>${formatValue(s.lo.value, state.data)}</strong></div></div><div class="panel chart-panel"><div class="chart-header"><h2>${escape(state.data.title)}</h2><button id="overview">Read overview</button></div><div class="chart" role="group" aria-label="Data points. Use left and right arrows to move. Enter plays a note.">${d.map((p, i) => `<button class="bar-item ${i === state.selected ? "selected" : ""}" data-point="${i}" aria-label="${escape(p.label)}, ${formatValue(p.value, state.data)} ${escape(state.data.unit)}" aria-pressed="${i === state.selected}"><span class="bar-value">${formatValue(p.value, state.data)} ${escape(state.data.unit)}</span><span class="bar" style="height:${Math.max(3, (Math.abs(p.value) / range) * 145)}px"></span><span>${escape(p.label)}</span></button>`).join("")}</div><div class="player"><button class="button" id="play">▶ Play all points</button><button id="stop">■ Stop</button><span>Low value <span aria-hidden="true">↗</span> High pitch</span></div></div><div class="point-detail" aria-live="polite"><span>SELECTED POINT ${state.selected + 1} / ${d.length}</span><strong>${escape(point.label)} <em>${formatValue(point.value, state.data)} ${escape(state.data.unit)}</em></strong><button id="single">♪ Play this point</button></div><div class="actions"><button id="back">← Edit mapping</button><span class="muted">← → Move between points · Enter to hear</span></div></section>`;
}
function bind() {
  const on = (id, fn) => {
    const e = document.getElementById(id);
    if (e) e.onclick = fn;
  };
  on("start", () => go(1));
  on("sample", () =>
    loadSheets(
      [{ name: "CSV", table: parseCSV(sample) }],
      "Rainfall by City.csv",
    ),
  );
  on("back", () => go(state.step - 1));
  const file = document.querySelector("#file");
  if (file)
    file.onchange = async () => {
      if (!file.files[0]) return;
      try {
        stopAll();
        const selectedFile = file.files[0];
        loadSheets(await parseFile(selectedFile), selectedFile.name);
      } catch (e) {
        state.error = e.message;
        render();
      }
    };
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
  on("stop", stopAll);
  on("overview", () => {
    state.voice = true;
    render();
    const s = summary();
    speak(
      `${rangeDescription(state.data)} ${aggregationLabels[state.data.aggregation]}. ${s.count} data points. Highest is ${s.hi.label}, ${formatValue(s.hi.value, state.data)} ${state.data.unit}. Lowest is ${s.lo.label}, ${formatValue(s.lo.value, state.data)} ${state.data.unit}.`,
    );
  });
  on("single", () => {
    stopAll();
    note(state.data.data[state.selected].value);
  });
  on("play", () => {
    stopAll();
    let i = 0;
    const next = () => {
      state.selected = i;
      render();
      note(state.data.data[i].value);
      i++;
      if (i < state.data.data.length) timer = setTimeout(next, 800);
    };
    next();
  });
  document.querySelectorAll("[data-point]").forEach((el) => {
    const select = (i) => {
      stopAll();
      state.selected = i;
      render();
      document.querySelector(`[data-point="${i}"]`).focus();
      note(state.data.data[i].value);
    };
    el.onclick = () => select(Number(el.dataset.point));
    el.onkeydown = (e) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        let i = Number(el.dataset.point);
        i =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? state.data.data.length - 1
              : Math.max(
                  0,
                  Math.min(
                    state.data.data.length - 1,
                    i + (e.key === "ArrowRight" ? 1 : -1),
                  ),
                );
        select(i);
      }
    };
  });
}
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") stopAll();
});
render();
