import test from "node:test";
import assert from "node:assert/strict";
import {
  createMaterial,
  validateMaterial,
  SAMPLE_MATERIAL,
  parseMaterialJSON,
  readLibrary,
  saveMaterial,
} from "../src/materials.js";
const metadata = {
  title: "Lesson",
  description: "Compare cities",
  learningGoal: "Find extremes",
};
const storage = () => ({
  value: null,
  getItem() {
    return this.value;
  },
  setItem(k, v) {
    this.value = v;
  },
});
test("immutable snapshots preserve semantics; stable ID and increasing revision", () => {
  const dataset = structuredClone(SAMPLE_MATERIAL.dataset);
  const first = createMaterial(dataset, metadata, null);
  dataset.data[0].value = 999;
  assert.equal(first.dataset.data[0].value, 95);
  assert.throws(() => {
    first.dataset.data[0].value = 1;
  }, TypeError);
  const next = createMaterial(dataset, metadata, first, [first]);
  assert.equal(next.id, first.id);
  assert.equal(next.revision, 2);
  assert.equal(next.dataset.data[0].value, 999);
  assert.deepEqual(parseMaterialJSON(JSON.stringify(first)), first);
});
test("schema rejects unsupported, corrupted and inconsistent material data", () => {
  assert.throws(() => parseMaterialJSON("{"), /damaged/);
  for (const change of [
    (m) => (m.schemaVersion = 2),
    (m) => (m.title = ""),
    (m) => (m.dataset.data = []),
    (m) => (m.dataset.data[0].value = null),
    (m) => (m.dataset.range.partial = true),
    (m) => (m.dataset.range.end = 4),
    (m) => (m.dataset.importedRows = 1),
    (m) => (m.dataset.aggregation = "bad"),
    (m) => (m.dataset.decimalPlaces = 11),
    (m) => (m.dataset.data[1].label = m.dataset.data[0].label),
  ]) {
    const m = structuredClone(SAMPLE_MATERIAL);
    change(m);
    assert.throws(() => validateMaterial(m));
  }
  assert.throws(() => parseMaterialJSON(" ".repeat(2_000_001)), /too large/);
});
test("local persistence is validated, idempotent, and fails without fake success", () => {
  const s = storage();
  assert.deepEqual(readLibrary(s), []);
  const list = saveMaterial(s, [], SAMPLE_MATERIAL);
  assert.deepEqual(readLibrary(s), list);
  assert.equal(saveMaterial(s, list, SAMPLE_MATERIAL).length, 1);
  const changed = structuredClone(SAMPLE_MATERIAL);
  changed.title = "conflict";
  assert.throws(() => saveMaterial(s, list, changed), /different content/);
  s.value = "broken";
  assert.throws(() => readLibrary(s), /could not be read/);
  assert.equal(s.value, "broken");
  assert.throws(
    () =>
      saveMaterial(
        {
          setItem() {
            throw new Error("QuotaExceededError");
          },
        },
        [],
        SAMPLE_MATERIAL,
      ),
    /blocked or full/,
  );
});
