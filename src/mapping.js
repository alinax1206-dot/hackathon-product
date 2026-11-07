import {
  DEFAULT_DECIMAL_PLACES,
  validateDecimalPlaces,
} from "./format-value.js";

export const MAX_EXPLORATION_POINTS = 100;

export const aggregationLabels = {
  none: "Do not aggregate",
  sum: "Sum",
  mean: "Average",
  count: "Count",
};

export function numericCell(value) {
  if (value == null || (typeof value === "string" && !value.trim()))
    return { error: "blank value" };
  if (!["number", "string"].includes(typeof value))
    return { error: "non-numeric value" };
  if (
    typeof value === "string" &&
    !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())
  ) {
    return {
      error: /^(?:[+-]?Infinity|NaN)$/i.test(value.trim())
        ? "non-finite value"
        : "non-numeric value",
    };
  }
  const number = Number(value);
  return Number.isFinite(number)
    ? { value: number }
    : { error: "non-finite value" };
}

export function recommendValue(fields, rows, category) {
  return (
    fields.find(
      (field) =>
        field !== category &&
        !/(?:^id$|id$|version|uuid|code|postal|zip|date|time|year)/i.test(
          field,
        ) &&
        rows.length &&
        rows.every((row) => !numericCell(row[field]).error),
    ) || ""
  );
}

export function mapColumns(
  rows,
  {
    x,
    y,
    aggregation = "none",
    unit,
    noUnit = false,
    title = "",
    sheet = "",
    decimalPlaces = DEFAULT_DECIMAL_PLACES,
  },
) {
  validateDecimalPlaces(decimalPlaces);
  if (!(aggregation in aggregationLabels))
    throw new Error("Choose an aggregation method.");
  if (!x || !Object.hasOwn(rows[0] || {}, x))
    throw new Error("Choose a category or time column.");
  if (
    aggregation !== "count" &&
    (!y || x === y || !Object.hasOwn(rows[0] || {}, y))
  ) {
    throw new Error("Choose different category and value columns.");
  }
  if (aggregation !== "count" && !noUnit && !unit?.trim())
    throw new Error("Enter a unit or explicitly select No unit.");
  const issues = [];
  const points = rows.map((row, i) => {
    const raw = row[x];
    const label = raw instanceof Date ? raw.toISOString() : String(raw ?? "");
    if (!label.trim()) issues.push(`Row ${i + 2}: blank category.`);
    const result = aggregation === "count" ? { value: 1 } : numericCell(row[y]);
    if (result.error) issues.push(`Row ${i + 2} (${y}): ${result.error}.`);
    return { label, value: result.value };
  });
  if (issues.length) throw new Error(issues.join("\n"));
  const groups = new Map();
  for (const point of points) {
    const group = groups.get(point.label);
    if (group) group.push(point.value);
    else groups.set(point.label, [point.value]);
  }
  if (aggregation === "none" && groups.size !== points.length) {
    const duplicates = [...groups]
      .filter(([, values]) => values.length > 1)
      .map(([label]) => label);
    throw new Error(
      `Repeated categories: ${duplicates.join(", ")}. Do not aggregate requires one record per category. Choose Sum, Average, or Count to continue.`,
    );
  }
  const data =
    aggregation === "none"
      ? points
      : [...groups].map(([label, values]) => {
          // Scaled mean avoids overflow for finite inputs whose mean is finite.
          const value =
            aggregation === "count"
              ? values.length
              : values.reduce(
                  (sum, n) =>
                    sum + n / (aggregation === "mean" ? values.length : 1),
                  0,
                );
          if (!Number.isFinite(value))
            throw new Error(
              `Category ${label}: aggregation produced a non-finite value.`,
            );
          return { label, value };
        });
  return {
    title,
    xAxis: x,
    yAxis: aggregation === "count" ? "Record count" : y,
    unit: aggregation === "count" ? "records" : noUnit ? "" : unit.trim(),
    aggregation,
    decimalPlaces: aggregation === "count" ? 0 : decimalPlaces,
    importedRows: rows.length,
    totalPoints: data.length,
    sheet,
    data,
  };
}

export function selectRange(dataset, start, end) {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 1 ||
    end > dataset.data.length ||
    end < start ||
    end - start + 1 > MAX_EXPLORATION_POINTS
  ) {
    throw new Error(
      `Choose a continuous range of 1 to ${MAX_EXPLORATION_POINTS} points within the mapped data (inclusive, starting at 1).`,
    );
  }
  return {
    ...dataset,
    data: dataset.data.slice(start - 1, end),
    range: {
      start,
      end,
      total: dataset.data.length,
      partial: start !== 1 || end !== dataset.data.length,
    },
  };
}

export function rangeDescription(dataset) {
  const r = dataset.range;
  return `${dataset.importedRows} imported rows. ${dataset.totalPoints} mapped points. Exploring points ${r.start}–${r.end} of ${r.total}${r.partial ? " (partial data)" : " (all data)"}.`;
}
