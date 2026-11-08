import Papa from "papaparse";
import readWorkbook from "read-excel-file/universal";

export function parseCSV(text) {
  const result = Papa.parse(text, { skipEmptyLines: false });
  if (result.errors.some((error) => error.code !== "UndetectableDelimiter"))
    throw new Error("CSV could not be read. Check quoting and delimiters.");
  // A final newline is a terminator, not an imported record.
  if (/\r?\n$/.test(text) && result.data.at(-1)?.every((v) => v === ""))
    result.data.pop();
  return result.data;
}

export async function parseFile(file) {
  if (/\.csv$/i.test(file.name))
    return [{ name: "CSV", table: parseCSV(await file.text()) }];
  if (!/\.xlsx$/i.test(file.name))
    throw new Error("Choose a CSV or XLSX file.");
  try {
    const sheets = await readWorkbook(await file.arrayBuffer(), {
      trim: false,
    });
    return sheets.map((sheet) => ({ name: sheet.sheet, table: sheet.data }));
  } catch {
    throw new Error(
      "This XLSX file could not be read. Use an unencrypted XLSX workbook.",
    );
  }
}

export function prepareTable(table) {
  if (!table.length)
    throw new Error("This worksheet is empty. Choose another worksheet.");
  const width = table.reduce((max, cells) => Math.max(max, cells.length), 0);
  if (!width) throw new Error("This worksheet has no columns.");
  const sourceHeaders = Array.from({ length: width }, (_, i) =>
    String(table[0][i] ?? "").trim(),
  );
  const reserved = new Set(sourceHeaders.filter(Boolean).map((name) => name.toLowerCase()));
  const used = new Set();
  const headerAdjustments = [];
  const fields = sourceHeaders.map((original, i) => {
    const base = original || `Column ${i + 1}`;
    let name = base;
    let suffix = 2;
    while (used.has(name.toLowerCase()) || (name !== original && reserved.has(name.toLowerCase()))) {
      name = `${base} (${suffix++})`;
    }
    used.add(name.toLowerCase());
    if (name !== original) {
      headerAdjustments.push({ column: i + 1, original, name });
    }
    return name;
  });
  const rows = table.slice(1).map((cells, i) => {
    return Object.fromEntries(
      fields.map((field, j) => [field, cells[j] ?? null]),
    );
  });
  if (!rows.length) throw new Error("This worksheet has no data rows.");
  return { fields, rows, headerAdjustments };
}
