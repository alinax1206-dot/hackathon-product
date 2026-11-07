import {
  aggregationLabels,
  MAX_EXPLORATION_POINTS,
  mapColumns,
  selectRange,
} from "./mapping.js";
import { validateDecimalPlaces } from "./format-value.js";
export const LIBRARY_KEY = "chartaloud.materials.v1";
export const MAX_JSON_BYTES = 2_000_000;
const fail = (message) => {
  throw new Error(`Invalid learning material: ${message}`);
};
const text = (value, name, required = true) => {
  if (
    typeof value !== "string" ||
    value.length > 10000 ||
    (required && !value.trim())
  )
    fail(
      `${name} must be ${required ? "non-empty " : ""}text (up to 10,000 characters).`,
    );
  return value;
};
export function validateMaterial(input) {
  if (!input || input.schemaVersion !== 1) fail("unsupported schema version.");
  if (typeof input.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.id))
    fail("invalid ID.");
  if (!Number.isSafeInteger(input.revision) || input.revision < 1)
    fail("invalid revision.");
  if (
    typeof input.createdAt !== "string" ||
    !Number.isFinite(Date.parse(input.createdAt))
  )
    fail("invalid creation date.");
  const d = input.dataset;
  if (
    !d ||
    !Array.isArray(d.data) ||
    d.data.length < 1 ||
    d.data.length > MAX_EXPLORATION_POINTS
  )
    fail("provide 1–100 data points.");
  if (!Object.hasOwn(aggregationLabels, d.aggregation))
    fail("invalid aggregation.");
  validateDecimalPlaces(d.decimalPlaces);
  if (
    !Number.isSafeInteger(d.importedRows) ||
    !Number.isSafeInteger(d.totalPoints) ||
    d.importedRows < d.totalPoints ||
    d.totalPoints < d.data.length
  )
    fail("invalid source counts.");
  const r = d.range;
  if (
    !r ||
    !Number.isSafeInteger(r.start) ||
    !Number.isSafeInteger(r.end) ||
    r.start < 1 ||
    r.end > d.totalPoints ||
    r.end - r.start + 1 !== d.data.length ||
    r.total !== d.totalPoints ||
    r.partial !== (r.start !== 1 || r.end !== d.totalPoints)
  )
    fail("range does not match the selected data.");
  const seen = new Set();
  const data = d.data.map((p) => {
    if (!p || typeof p.value !== "number" || !Number.isFinite(p.value))
      fail("values must be finite numbers.");
    const label = text(p.label, "point label");
    if (seen.has(label)) fail("categories must be unique.");
    seen.add(label);
    if (
      d.aggregation === "count" &&
      (!Number.isSafeInteger(p.value) || p.value < 1)
    )
      fail("counts must be positive integers.");
    return { label, value: p.value };
  });
  if (d.aggregation === "none" && d.importedRows !== d.totalPoints)
    fail("unaggregated source counts must match.");
  if (
    d.aggregation === "count" &&
    (d.unit !== "records" ||
      d.yAxis !== "Record count" ||
      d.decimalPlaces !== 0 ||
      data.reduce((n, p) => n + p.value, 0) > d.importedRows ||
      (!r.partial && data.reduce((n, p) => n + p.value, 0) !== d.importedRows))
  )
    fail("inconsistent count semantics.");
  return {
    schemaVersion: 1,
    id: input.id,
    revision: input.revision,
    title: text(input.title, "title"),
    description: text(input.description, "description", false),
    learningGoal: text(input.learningGoal, "learning goal", false),
    createdAt: input.createdAt,
    dataset: {
      title: text(d.title, "dataset title"),
      xAxis: text(d.xAxis, "category axis"),
      yAxis: text(d.yAxis, "value axis"),
      unit: text(d.unit, "unit", false),
      data,
      aggregation: d.aggregation,
      decimalPlaces: d.decimalPlaces,
      importedRows: d.importedRows,
      totalPoints: d.totalPoints,
      sheet: text(d.sheet ?? "", "worksheet", false),
      range: { start: r.start, end: r.end, total: r.total, partial: r.partial },
    },
  };
}
export function immutable(value) {
  Object.values(value).forEach((v) => {
    if (v && typeof v === "object") immutable(v);
  });
  return Object.freeze(value);
}
export function createMaterial(dataset, metadata, previous, library = []) {
  const id = previous?.id ?? crypto.randomUUID();
  const revision =
    Math.max(
      previous?.revision ?? 0,
      ...library.filter((m) => m.id === id).map((m) => m.revision),
      0,
    ) + 1;
  return immutable(
    validateMaterial({
      schemaVersion: 1,
      id,
      revision,
      createdAt: new Date().toISOString(),
      ...metadata,
      dataset: structuredClone(dataset),
    }),
  );
}
export function parseMaterialJSON(source) {
  if (new TextEncoder().encode(source).length > MAX_JSON_BYTES)
    throw new Error(
      "Material file is too large. Choose a JSON file under 2 MB.",
    );
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(
      "This JSON file is damaged or unreadable. Choose a valid exported learning material.",
    );
  }
  return immutable(validateMaterial(parsed));
}
export function readLibrary(storage) {
  try {
    const raw = storage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error();
    return data.map((m) => immutable(validateMaterial(m)));
  } catch {
    throw new Error(
      "The local material library could not be read. Retry, import a valid JSON file, or open Sample. Existing storage has not been overwritten.",
    );
  }
}
export function saveMaterial(storage, library, material) {
  const checked = immutable(validateMaterial(material));
  const existing = library.find(
    (m) => m.id === checked.id && m.revision === checked.revision,
  );
  if (existing && JSON.stringify(existing) !== JSON.stringify(checked)) {
    const error = new Error(
      "This ID and revision already exist with different content. Import the original file or publish a new revision.",
    );
    error.code = "MATERIAL_CONFLICT";
    throw error;
  }
  const next = existing ? library : [...library, checked];
  try {
    storage.setItem(LIBRARY_KEY, JSON.stringify(next));
  } catch {
    throw new Error(
      "Material could not be saved. Browser storage may be blocked or full. Free storage and retry; you can also export JSON to keep this material.",
    );
  }
  return next;
}
const sampleDataset = mapColumns(
  ["Seattle,95", "Portland,78", "Boston,65", "Austin,42", "Denver,28"].map(
    (row) => {
      const [City, Rainfall] = row.split(",");
      return { City, Rainfall };
    },
  ),
  {
    x: "City",
    y: "Rainfall",
    unit: "mm",
    title: "Rainfall by City",
    sheet: "CSV",
  },
);
export const SAMPLE_MATERIAL = immutable(
  validateMaterial({
    schemaVersion: 1,
    id: "chartaloud-sample-rainfall",
    revision: 1,
    title: "Sample — Rainfall by City",
    description:
      "Compare rainfall across five cities. Built-in practice material.",
    learningGoal: "Find the cities with the highest and lowest rainfall.",
    createdAt: "2026-11-07T00:00:00.000Z",
    dataset: selectRange(sampleDataset, 1, 5),
  }),
);
