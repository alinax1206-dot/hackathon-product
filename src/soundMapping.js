// Deterministic sonification transformations. AI never writes frequencies or data.
export const SOUND_MAPPINGS = Object.freeze(['linear', 'contrast']);

export function normalizedPitch(value, range, mapping = 'linear') {
  if (!SOUND_MAPPINGS.includes(mapping)) throw new RangeError('Unknown sound mapping.');
  if (!Number.isFinite(value) || !Number.isFinite(range?.min) || !Number.isFinite(range?.max) || range.max < range.min) {
    throw new TypeError('Value and range must be finite numbers.');
  }
  if (range.max === range.min) return 0.5;
  // Avoid overflow for extreme finite inputs.
  const scale = Math.max(Math.abs(range.min), Math.abs(range.max)) || 1;
  const fraction = Math.max(0, Math.min(1,
    ((value / scale) - (range.min / scale)) / ((range.max / scale) - (range.min / scale))
  ));
  // Concave monotonic transform: expands differences near the minimum while
  // compressing differences near the maximum; does not preserve numeric ratios.
  return mapping === 'contrast' ? Math.sqrt(fraction) : fraction;
}
