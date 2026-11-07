export const DEFAULT_DECIMAL_PLACES = 2;
export const MAX_DECIMAL_PLACES = 10;

export function validateDecimalPlaces(decimalPlaces) {
  if (
    !Number.isInteger(decimalPlaces) ||
    decimalPlaces < 0 ||
    decimalPlaces > MAX_DECIMAL_PLACES
  ) {
    throw new Error(
      `Choose a decimal places value from 0 to ${MAX_DECIMAL_PLACES}.`,
    );
  }
}

// Formatting is presentation-only: never round the numeric dataset or audio input.
export function formatValue(value, dataset) {
  const places =
    dataset.aggregation === "count"
      ? 0
      : (dataset.decimalPlaces ?? DEFAULT_DECIMAL_PLACES);
  validateDecimalPlaces(places);
  const formatted = new Intl.NumberFormat("en-US", {
    useGrouping: false,
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  }).format(value);
  return formatted.startsWith("-") && Number(formatted) === 0
    ? formatted.slice(1)
    : formatted;
}
