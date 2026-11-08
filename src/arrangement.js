import { normalizedPitch } from "./soundMapping.js";
export const MIN_FREQUENCY = 220;
export const MAX_FREQUENCY = 660;
export const INSTRUMENTS = {
  piano: 'Grand piano',
  'acoustic-guitar': 'Acoustic guitar',
  marimba: 'Marimba',
  vibraphone: 'Vibraphone',
  kalimba: 'Kalimba',
  'clean-guitar': 'Clean electric guitar',
  'string-section': 'String ensemble',
  'hammond-organ': 'Hammond organ',
  flute: 'Flute',
  harp: 'Harp',
  'bass-electric': 'Electric bass',
  saxophone: 'Saxophone',
  trumpet: 'Trumpet',
  violin: 'Violin',
  xylophone: 'Xylophone',
  cello: 'Cello'
};
const MINOR_PENTATONIC = [57, 60, 62, 64, 67, 69, 72, 74, 76];
const MAJOR_PENTATONIC = [57, 59, 61, 64, 66, 69, 71, 73, 76];
export const STYLES = {
  acoustic: { name: 'Warm acoustic', description: 'Gentle strings and plucked notes', instruments: ['acoustic-guitar', 'piano', 'harp', 'kalimba', 'marimba', 'flute', 'violin', 'bass-electric'], bpm: 106, tail: 0.22, backing: 'acoustic-guitar', scale: MAJOR_PENTATONIC, pulse: [0.72], accentEvery: 4, noteLength: 0.8 },
  luminous: { name: 'Luminous', description: 'Floating mallets and airy tones', instruments: ['marimba', 'vibraphone', 'kalimba', 'harp', 'flute', 'piano', 'xylophone', 'string-section'], bpm: 90, tail: 0.56, backing: 'vibraphone', scale: MAJOR_PENTATONIC, pulse: [0.95], accentEvery: 4, noteLength: 1.0 },
  chamber: { name: 'Chamber', description: 'A measured acoustic ensemble', instruments: ['piano', 'string-section', 'violin', 'cello', 'flute', 'harp', 'marimba', 'vibraphone'], bpm: 82, tail: 0.42, backing: 'string-section', scale: MINOR_PENTATONIC, pulse: [0.82, 0.82, 1.08], accentEvery: 3, noteLength: 0.9 },
  electric: { name: 'Electric lounge', description: 'Soft keys, guitar, bass, and brass', instruments: ['clean-guitar', 'hammond-organ', 'vibraphone', 'piano', 'acoustic-guitar', 'bass-electric', 'saxophone', 'trumpet'], bpm: 112, tail: 0.28, backing: 'hammond-organ', scale: MINOR_PENTATONIC, pulse: [0.62, 0.82], accentEvery: 4, noteLength: 0.75 },
  jazz: { name: 'Night jazz', description: 'A relaxed swing with brass and bass', instruments: ['piano', 'saxophone', 'trumpet', 'bass-electric', 'vibraphone', 'clean-guitar', 'hammond-organ', 'flute'], bpm: 94, tail: 0.3, backing: 'bass-electric', scale: MINOR_PENTATONIC, pulse: [0.52, 0.92], accentEvery: 4, noteLength: 0.8 },
  folk: { name: 'Folk', description: 'Guitar and strings with a steady pulse', instruments: ['acoustic-guitar', 'harp', 'violin', 'cello', 'flute', 'kalimba', 'piano', 'bass-electric'], bpm: 102, tail: 0.26, backing: 'acoustic-guitar', scale: MAJOR_PENTATONIC, pulse: [0.75], accentEvery: 4, noteLength: 0.78 },
  cinematic: { name: 'Cinematic', description: 'Slow strings and spacious brass', instruments: ['string-section', 'cello', 'violin', 'flute', 'harp', 'piano', 'trumpet', 'marimba'], bpm: 74, tail: 0.6, backing: 'cello', scale: MINOR_PENTATONIC, pulse: [1.08], accentEvery: 4, noteLength: 1.1 },
  playful: { name: 'Playful', description: 'Bright mallets and quick notes', instruments: ['xylophone', 'marimba', 'kalimba', 'vibraphone', 'piano', 'flute', 'harp', 'acoustic-guitar'], bpm: 126, tail: 0.18, backing: 'marimba', scale: MAJOR_PENTATONIC, pulse: [0.58, 0.86], accentEvery: 4, noteLength: 0.65 },
  rainy: { name: 'Rainy day', description: 'Soft rain with piano, guitar, and warm strings', instruments: ['piano', 'acoustic-guitar', 'harp', 'kalimba', 'flute', 'cello', 'string-section', 'bass-electric'], bpm: 78, tail: 0.46, backing: 'piano', scale: MINOR_PENTATONIC, pulse: [0.95, 1.05], accentEvery: 4, noteLength: 0.92, ambience: 'rain' },
  chimes: { name: 'Wind chimes', description: 'Clear chimes with bright mallets and airy notes', instruments: ['vibraphone', 'marimba', 'kalimba', 'xylophone', 'harp', 'flute', 'piano', 'violin'], bpm: 96, tail: 0.55, backing: 'vibraphone', scale: MAJOR_PENTATONIC, pulse: [0.72, 1.12], accentEvery: 4, noteLength: 0.82, ambience: 'chimes' },
  riverside: { name: 'Riverside', description: 'Flowing water with flute, harp, and gentle strings', instruments: ['flute', 'harp', 'acoustic-guitar', 'kalimba', 'marimba', 'violin', 'cello', 'string-section'], bpm: 88, tail: 0.52, backing: 'harp', scale: MAJOR_PENTATONIC, pulse: [0.88, 1.04, 0.96], accentEvery: 3, noteLength: 0.9, ambience: 'stream' }
};
export const ORDERS = ['category', 'series', 'together'];
export const PLAYBACKS = ['points', 'music'];
export const midiToFrequency = midi => 440 * 2 ** ((midi - 69) / 12);

export function validateDataset(dataset) {
  if (!dataset || !Array.isArray(dataset.data) || dataset.data.length === 0) throw new TypeError('Dataset needs at least one row.');
  if (!Array.isArray(dataset.series) || dataset.series.length === 0) throw new TypeError('Choose at least one numeric column.');
  const keys = new Set();
  for (const series of dataset.series) {
    if (!series || typeof series.key !== 'string' || !series.key.trim() || keys.has(series.key)) throw new TypeError('Numeric column names must be unique.');
    keys.add(series.key);
  }
  dataset.data.forEach((point, rowIndex) => {
    if (!point || typeof point.label !== 'string' || !point.label.trim() || !point.values) throw new TypeError(`Row ${rowIndex + 1} needs a category label.`);
    for (const key of keys) {
      if (typeof point.values[key] !== 'number' || !Number.isFinite(point.values[key])) throw new TypeError(`Row ${rowIndex + 1}, ${key}, needs a finite number.`);
    }
  });
  return dataset;
}

export function seriesRange(dataset, key) {
  validateDataset(dataset);
  let min = Infinity, max = -Infinity;
  for (const point of dataset.data) { min = Math.min(min, point.values[key]); max = Math.max(max, point.values[key]); }
  return { min, max };
}

export function valueToFrequency(value, range, mapping = 'linear') {
  return MIN_FREQUENCY + normalizedPitch(value, range, mapping) * (MAX_FREQUENCY - MIN_FREQUENCY);
}

function noteFor(value, range, playback, style, mapping) {
  const frequency = valueToFrequency(value, range, mapping);
  if (playback === 'points') return frequency;
  const scale = STYLES[style].scale;
  const fraction = (frequency - MIN_FREQUENCY) / (MAX_FREQUENCY - MIN_FREQUENCY);
  return midiToFrequency(scale[Math.round(fraction * (scale.length - 1))]);
}

export function buildArrangement(dataset, { order = 'category', playback = 'points', style = 'acoustic', instruments = {}, mapping = 'linear' } = {}) {
  validateDataset(dataset);
  if (!ORDERS.includes(order)) throw new RangeError('Unknown playback order.');
  if (!PLAYBACKS.includes(playback)) throw new RangeError('Unknown playback mode.');
  if (!STYLES[style]) throw new RangeError('Unknown music style.');
  const preset = STYLES[style];
  const series = dataset.series.map((item, index) => ({
    key: item.key,
    instrument: instruments[item.key] ?? item.instrument ?? preset.instruments[index % preset.instruments.length]
  }));
  for (const item of series) if (!preset.instruments.includes(item.instrument)) throw new RangeError(`${item.instrument} is outside the ${preset.name} instrument set.`);
  const ranges = Object.fromEntries(series.map(item => [item.key, { min: Infinity, max: -Infinity }]));
  for (const point of dataset.data) for (const item of series) {
    const value = point.values[item.key];
    ranges[item.key].min = Math.min(ranges[item.key].min, value);
    ranges[item.key].max = Math.max(ranges[item.key].max, value);
  }
  const beat = 60000 / preset.bpm;
  const notesFor = (rowIndex, seriesIndex) => {
    const item = series[seriesIndex];
    return { frequency: noteFor(dataset.data[rowIndex].values[item.key], ranges[item.key], playback, style, mapping),
      instrument: item.instrument, key: item.key, value: dataset.data[rowIndex].values[item.key], level: 1 };
  };
  const steps = [];
  const add = (rowIndex, seriesIndex, notes) => {
    const durationMs = playback === 'music' ? beat * preset.noteLength : 440;
    const pulse = preset.pulse[steps.length % preset.pulse.length];
    const waitMs = playback === 'music' ? beat * (order === 'together' ? Math.max(1, pulse) : pulse) : (order === 'together' ? 780 : 680);
    steps.push({ rowIndex, seriesIndex, label: dataset.data[rowIndex].label, notes, durationMs, waitMs });
  };
  if (order === 'series') {
    series.forEach((_, seriesIndex) => dataset.data.forEach((_, rowIndex) => add(rowIndex, seriesIndex, [notesFor(rowIndex, seriesIndex)])));
  } else {
    dataset.data.forEach((_, rowIndex) => {
      if (order === 'together') add(rowIndex, null, series.map((_, seriesIndex) => notesFor(rowIndex, seriesIndex)));
      else series.forEach((_, seriesIndex) => add(rowIndex, seriesIndex, [notesFor(rowIndex, seriesIndex)]));
    });
  }
  if (playback === 'music') {
    // Quiet harmonic support is deliberately separate from the data notes.
    steps.forEach((step, index) => {
      if (index % preset.accentEvery === 0) step.notes.push({ frequency: midiToFrequency(57), instrument: preset.backing, level: 0.32, accompaniment: true });
    });
    steps.push({ rowIndex: null, seriesIndex: null, label: 'Ending',
      notes: [57, 64, 69].map(midi => ({ frequency: midiToFrequency(midi), instrument: preset.backing, level: 0.25, accompaniment: true })),
      durationMs: beat * 1.25, waitMs: beat * 1.5 });
  }
  return { steps, series, style, playback, order, dataset };
}
