/** Style-specific background recordings. These never encode CSV values. */
export const SOUNDSCAPES = {
  off: { name: 'None', layers: [] },
  rain: { name: 'Rain', layers: [{ id: 'rain', level: 0.075, lowpass: 2200 }] },
  chimes: { name: 'Wind chimes', layers: [{ id: 'wind-chimes', level: 0.065, lowpass: 4200 }] },
  stream: { name: 'Flowing water', layers: [{ id: 'stream', level: 0.075, lowpass: 2400 }] }
};
const base = import.meta.env?.BASE_URL ?? '/';
const cache = new Map();

export function soundscape(name = 'off') {
  const preset = SOUNDSCAPES[name];
  if (!preset) throw new RangeError('Unknown environmental sound.');
  return preset;
}

async function loadBuffer(context, id) {
  const response = await fetch(`${base}ambience/${id}.mp3`);
  if (!response.ok) throw new Error(`Could not load ${id} environmental sound.`);
  return context.decodeAudioData(await response.arrayBuffer());
}

export async function loadSoundscape(context, name = 'off') {
  const preset = soundscape(name);
  const ids = [...new Set(preset.layers.map(layer => layer.id))];
  const entries = await Promise.all(ids.map(async id => {
    if (!cache.has(id)) cache.set(id, loadBuffer(context, id).catch(error => { cache.delete(id); throw error; }));
    return [id, await cache.get(id)];
  }));
  return new Map(entries);
}
