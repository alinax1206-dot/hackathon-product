import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCSV, parseFile, prepareTable } from "../src/import-data.js";
import {
  mapColumns,
  numericCell,
  recommendValue,
  selectRange,
} from "../src/mapping.js";
const options = { x: "Category", y: "amount", noUnit: true };
const table = [
  ["Category", "amount", "id", "version"],
  [" A ", 0, 1, 1],
  ["B", -4, 2, 2],
  [" A ", 6, 3, 3],
];

test("CSV preserves labels, zero, negative numbers and original table", () => {
  const original = parseCSV('Category,amount\n" A ",0\nB,-4\n');
  const copy = structuredClone(original);
  const { rows } = prepareTable(original);
  assert.deepEqual(mapColumns(rows, options).data, [
    { label: " A ", value: 0 },
    { label: "B", value: -4 },
  ]);
  assert.deepEqual(original, copy);
  assert.deepEqual(prepareTable(parseCSV("a,a\n1,2")).fields, ["a", "a (2)"]);
});
test("blank, repeated and short headers import without discarding values", () => {
  const original = parseCSV(",Date,Date,Column 1\n0,2015-12-27,2015-12-20,Albany,42\n1,2015-12-19,2015-12-18,Boston,55\n");
  const snapshot = structuredClone(original);
  const result = prepareTable(original);
  assert.deepEqual(result.fields, ["Column 1 (2)", "Date", "Date (2)", "Column 1", "Column 5"]);
  assert.equal(result.rows[0]["Column 5"], "42");
  assert.equal(result.rows[1]["Date (2)"], "2015-12-18");
  assert.equal(result.headerAdjustments.length, 3);
  assert.deepEqual(original, snapshot);
});
test("duplicates require explicit aggregation; stable sum, mean and count", () => {
  const { rows } = prepareTable(table);
  assert.throws(() => mapColumns(rows, options), /Repeated categories/);
  for (const [aggregation, values] of [
    ["sum", [6, -4]],
    ["mean", [3, -4]],
    ["count", [2, 1]],
  ]) {
    const result = mapColumns(rows, {
      ...options,
      aggregation,
      y: aggregation === "count" ? "" : "amount",
    });
    assert.deepEqual(result.data, [
      { label: " A ", value: values[0] },
      { label: "B", value: values[1] },
    ]);
    if (aggregation === "count") assert.equal(result.unit, "records");
  }
  assert.throws(
    () => mapColumns(rows, { ...options, y: "Category" }),
    /different/,
  );
  assert.throws(() => mapColumns(rows, { ...options, noUnit: false }), /unit/);
});
test("invalid numbers report source rows; count ignores invalid values", () => {
  const rows = ["", null, "oops", "Infinity", NaN, Infinity, true].map(
    (amount, i) => ({ Category: `C${i}`, amount }),
  );
  assert.throws(
    () => mapColumns(rows, options),
    (error) =>
      /Row 2.*blank/.test(error.message) &&
      /Row 4.*non-numeric/.test(error.message) &&
      /Row 5.*non-finite/.test(error.message),
  );
  assert.equal(
    mapColumns(rows, { ...options, aggregation: "count" }).data.length,
    7,
  );
  for (const v of [0, -5, "0", "-1.5", "1e3"])
    assert.equal(numericCell(v).error, undefined);
});
test("recommendation excludes identifiers, versions and dates while allowing manual mapping", () => {
  const { rows, fields } = prepareTable(table);
  assert.equal(
    recommendValue(
      ["Category", "id", "version", "account_id", "Date"],
      rows,
      "Category",
    ),
    "",
  );
  assert.equal(recommendValue(fields, rows, "Category"), "amount");
  assert.equal(
    mapColumns(rows, { ...options, y: "id", aggregation: "sum" }).data[0].value,
    4,
  );
});
test("XLSX imports multiple sheets; explicit ranges preserve source order and full mapping", async () => {
  const bytes = await readFile(
    new URL("./fixtures/workbook.xlsx", import.meta.url),
  );
  const sheets = await parseFile({
    name: "workbook.xlsx",
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
  assert.deepEqual(
    sheets.map((s) => s.name),
    ["Records", "Long series", "Invalid"],
  );
  assert.equal(sheets[0].table[1][0], " A ");
  const { rows } = prepareTable(sheets[1].table);
  const mapped = mapColumns(rows, { x: "Day", y: "Value", unit: "mm" });
  assert.equal(mapped.data.length, 121);
  assert.equal(selectRange(mapped, 1, 100).data.length, 100);
  assert.throws(() => selectRange(mapped, 1, 101), /1 to 100/);
  assert.throws(() => selectRange(mapped, 0, 10));
  const selected = selectRange(mapped, 22, 121);
  assert.equal(selected.data.length, 100);
  assert.deepEqual(selected.range, {
    start: 22,
    end: 121,
    total: 121,
    partial: true,
  });
  assert.equal(selected.data[0].label, "Day 22");
  assert.equal(mapped.data.length, 121);
});

test("decimal formatting preserves calculation precision, handles zero/negatives and keeps count integral", async () => {
  const { formatValue } = await import("../src/format-value.js");
  const rows = [
    { Category: "A", amount: 1.23456 },
    { Category: "A", amount: 2.34567 },
  ];
  const mapped = mapColumns(rows, {
    ...options,
    aggregation: "mean",
    decimalPlaces: 3,
  });
  assert.equal(mapped.data[0].value, (1.23456 + 2.34567) / 2);
  assert.equal(formatValue(mapped.data[0].value, mapped), "1.790");
  assert.equal(formatValue(-1.23456, mapped), "-1.235");
  assert.equal(formatValue(0, mapped), "0.000");
  assert.equal(formatValue(-0.00001, mapped), "0.000");
  assert.equal(formatValue(1.6, { decimalPlaces: 0 }), "2");
  assert.equal(formatValue(1.2, { decimalPlaces: 10 }), "1.2000000000");
  const count = mapColumns(rows, {
    ...options,
    aggregation: "count",
    decimalPlaces: 3,
  });
  assert.equal(count.decimalPlaces, 0);
  assert.equal(formatValue(count.data[0].value, count), "2");
  assert.equal(selectRange(mapped, 1, 1).decimalPlaces, 3);
  for (const decimalPlaces of [-1, 11, 1.5, "2"])
    assert.throws(
      () => mapColumns(rows, { ...options, decimalPlaces }),
      /decimal places/,
    );
});
