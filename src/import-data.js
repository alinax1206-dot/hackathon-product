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
  const fields = table[0].map((v) => (v == null ? "" : String(v)));
  if (
    !fields.length ||
    fields.some((f) => !f.trim()) ||
    new Set(fields).size !== fields.length
  ) {
    throw new Error(
      "Column headers must be non-empty and unique. Fix the source table or choose another worksheet.",
    );
  }
  const rows = table.slice(1).map((cells, i) => {
    if (
      cells.length > fields.length &&
      cells.slice(fields.length).some((v) => v != null && v !== "")
    ) {
      throw new Error(`Row ${i + 2}: more cells than column headers.`);
    }
    return Object.fromEntries(
      fields.map((field, j) => [field, cells[j] ?? null]),
    );
  });
  if (!rows.length) throw new Error("This worksheet has no data rows.");
  return { fields, rows };
}
