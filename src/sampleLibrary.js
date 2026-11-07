const base = import.meta.env?.BASE_URL ?? '/';
const cache = new Map();

async function loadInstrument(context, id) {
  const manifestResponse = await fetch(`${base}samples/${id}/manifest.json`);
  if (!manifestResponse.ok) throw new Error(`Could not load ${id} instrument details.`);
  const manifest = await manifestResponse.json();
  const samples = await Promise.all(manifest.samples.map(async ({ note, file }) => {
    const response = await fetch(`${base}samples/${id}/${file}`);
    if (!response.ok) throw new Error(`Could not load ${id} sample ${file}.`);
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    return { note, buffer };
  }));
  return samples;
}

export function getSamples(context, id) {
  if (!cache.has(id)) cache.set(id, loadInstrument(context, id).catch(error => { cache.delete(id); throw error; }));
  return cache.get(id);
}

export async function prepareInstruments(context, ids) {
  await Promise.all([...new Set(ids)].map(id => getSamples(context, id)));
}

export async function closestSample(context, id, frequency) {
  const samples = await getSamples(context, id);
  const target = 69 + 12 * Math.log2(frequency / 440);
  return samples.reduce((nearest, sample) => Math.abs(sample.note - target) < Math.abs(nearest.note - target) ? sample : nearest);
}
