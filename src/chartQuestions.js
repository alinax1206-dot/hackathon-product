import { formatValue } from "./format-value.js";

// Answer exact chart facts without sending data to a remote model.
// Leave interpretation and compound questions to the conversational assistant.
export function answerChartQuestion(text, dataset) {
  if (!dataset?.data?.length) return null;
  const question = String(text).trim().toLowerCase();
  if (/\b(why|explain|predict|forecast|cause|compare|and|but)\b/.test(question))
    return null;
  const highest = /\b(highest|largest|biggest|maximum|max)\b/.test(question);
  const lowest = /\b(lowest|smallest|minimum|min)\b/.test(question);
  if (highest === lowest) return null;
  // A maximum change/date is not necessarily the maximum chart value.
  if (/\b(change|increase|decrease|difference|date|label)\b/.test(question))
    return null;
  const values = dataset.data.map((point) => point.value);
  if (
    !values.every(
      (value) => typeof value === "number" && Number.isFinite(value),
    )
  )
    return null;
  const value = highest ? Math.max(...values) : Math.min(...values);
  const matches = dataset.data.filter((point) => point.value === value);
  const labels = matches.map((point) => point.label).join(", ");
  const unit = dataset.unit ? ` ${dataset.unit}` : "";
  return `The ${highest ? "highest" : "lowest"} value is ${formatValue(value, dataset)}${unit}, at ${labels}${matches.length > 1 ? " (tied)" : ""}.`;
}
