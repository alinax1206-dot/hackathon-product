import { buildArrangement, valueToFrequency as mapFrequency, INSTRUMENTS as INSTRUMENT_NAMES, STYLES } from './arrangement.js';
import { prepareInstruments, getSamples } from './sampleLibrary.js';
import { loadSoundscape, soundscape } from './ambience.js';

export const MIN_FREQUENCY = 220;
export const MAX_FREQUENCY = 660;
export const INSTRUMENTS = Object.keys(INSTRUMENT_NAMES);
export const MODES = ['uniform', 'mixed'];

// Legacy single-series shape remains usable by teammates and the audio test page.
export function validateDataset(dataset) {
  if (!dataset || !Array.isArray(dataset.data) || !dataset.data.length) throw new TypeError('Dataset must contain a nonempty data array.');
  const data = dataset.data.map((point, index) => {
    if (!point || typeof point.label !== 'string' || !point.label.trim() || typeof point.value !== 'number' || !Number.isFinite(point.value))
      throw new TypeError(`Point ${index + 1} needs a label and a finite numeric value.`);
    return { label: point.label, value: point.value };
  });
  let min = Infinity, max = -Infinity;
  for (const point of data) { min = Math.min(min, point.value); max = Math.max(max, point.value); }
  return { ...dataset, data, min, max };
}
export function valueToFrequency(value, dataset) {
  const checked = validateDataset(dataset);
  return mapFrequency(value, { min: checked.min, max: checked.max });
}
function singleToMulti(dataset, instrument) {
  const checked = validateDataset(dataset);
  return { title: checked.title, xAxis: checked.xAxis, series: [{ key: checked.yAxis || 'Value', instrument }],
    data: checked.data.map(point => ({ label: point.label, values: { [checked.yAxis || 'Value']: point.value } })) };
}

export class AudioEngine {
  constructor({ onStateChange } = {}) {
    this.onStateChange = onStateChange;
    this.context = null;
    this.status = 'stopped';
    this.arrangement = null;
    this.index = 0;
    this.deadline = 0;
    this.noteDeadline = 0;
    this.remainingMs = 0;
    this.remainingNoteMs = 0;
    this.timer = null;
    this.voices = new Set();
    this.samples = new Map();
    this.ambienceChoice = 'off';
    this.ambienceBuffers = new Map();
    this.ambientSources = new Set();
    this.ambientOffsets = {};
    this.generation = 0;
    this.lastRequest = null;
    this.single = false;
  }
  getState() {
    const step = this.arrangement?.steps[this.index];
    return { status: this.status, index: this.index, count: this.arrangement?.steps.length ?? 0,
      rowIndex: step?.rowIndex ?? null, seriesIndex: step?.seriesIndex ?? null,
      label: step?.label ?? '', remainingMs: this.remainingMs, single: this.single };
  }
  _emit() { this.onStateChange?.(this.getState()); }
  async _ready() {
    const Constructor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Constructor) throw new Error('This browser does not support Web Audio.');
    this.context ??= new Constructor();
    if (this.context.state !== 'running') await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Audio is blocked. Press a playback button to unlock it.');
  }
  _silence() {
    clearTimeout(this.timer); this.timer = null;
    for (const voice of [...this.voices]) voice.stop();
    this._stopAmbience();
  }
  _stopAmbience() { for (const layer of [...this.ambientSources]) layer.stop(); }
  _startAmbience() {
    const ctx = this.context;
    const start = ctx.currentTime + 0.006;
    for (const layer of soundscape(this.ambienceChoice).layers) {
      const buffer = this.ambienceBuffers.get(layer.id);
      const source = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      source.buffer = buffer;
      source.loop = true;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(layer.lowpass, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(layer.level, start + 0.25);
      source.connect(filter).connect(gain).connect(ctx.destination);
      const offset = (this.ambientOffsets[layer.id] ?? 0) % buffer.duration;
      const voice = { id: layer.id, offset, startedAt: start, buffer, gain, level: layer.level, stop: () => {
        if (!this.ambientSources.has(voice)) return;
        this.ambientSources.delete(voice);
        try { source.stop(); } catch { /* already ended */ }
        source.disconnect(); filter.disconnect(); gain.disconnect();
      } };
      this.ambientSources.add(voice);
      source.onended = voice.stop;
      source.start(start, offset);
    }
  }
  _duckAmbience(durationMs) {
    if (!this.ambientSources.size) return;
    const now = this.context.currentTime;
    for (const layer of this.ambientSources) {
      const param = layer.gain.gain;
      param.cancelScheduledValues(now);
      param.setValueAtTime(layer.level * 0.55, now);
      param.setValueAtTime(layer.level * 0.55, now + durationMs / 1000);
      param.linearRampToValueAtTime(layer.level, now + durationMs / 1000 + 0.16);
    }
  }
  _voice(note, durationMs, playback, voiceCount) {
    const ctx = this.context;
    const samples = this.samples.get(note.instrument);
    const target = 69 + 12 * Math.log2(note.frequency / 440);
    const sample = samples.reduce((best, item) => Math.abs(item.note - target) < Math.abs(best.note - target) ? item : best);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = sample.buffer;
    source.playbackRate.value = note.frequency / (440 * 2 ** ((sample.note - 69) / 12));
    const now = ctx.currentTime + 0.006;
    const tail = playback === 'music' ? STYLES[this.arrangement.style].tail : 0.12;
    const level = (note.accompaniment ? 0.105 : 0.22) * note.level / Math.sqrt(voiceCount);
    const end = now + durationMs / 1000 + tail;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(level, now + 0.012);
    gain.gain.setValueAtTime(level, now + Math.max(0.02, durationMs / 1000 * 0.65));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    source.connect(gain).connect(ctx.destination);
    const voice = { stop: () => {
      if (!this.voices.has(voice)) return;
      this.voices.delete(voice);
      try { source.stop(); } catch { /* source already ended */ }
      source.disconnect(); gain.disconnect();
    } };
    this.voices.add(voice);
    source.onended = voice.stop;
    source.start(now);
    source.stop(end);
  }
  _tick(durationMs, waitMs) {
    const step = this.arrangement.steps[this.index];
    const duration = durationMs ?? step.durationMs;
    const wait = waitMs ?? step.waitMs;
    if (duration > 0) {
      this._duckAmbience(duration);
      for (const note of step.notes) this._voice(note, duration, this.arrangement.playback, step.notes.length);
    }
    const now = performance.now();
    this.noteDeadline = now + duration;
    this.deadline = now + wait;
    this.remainingMs = wait;
    this._emit();
    const generation = this.generation;
    this.timer = setTimeout(() => {
      if (generation !== this.generation || this.status !== 'playing') return;
      if (this.index >= this.arrangement.steps.length - 1) {
        this._stopAmbience(); this.status = 'stopped'; this.remainingMs = 0; this._emit();
      } else { this.index += 1; this._tick(); }
    }, wait);
  }
  async _begin(arrangement, request, single = false) {
    this.stopAudio();
    const generation = this.generation;
    this.arrangement = arrangement;
    this.ambienceChoice = arrangement.playback === 'music' ? (STYLES[arrangement.style].ambience ?? 'off') : 'off';
    soundscape(this.ambienceChoice);
    this.ambientOffsets = {};
    this.index = 0;
    this.single = single;
    this.status = 'loading'; this._emit();
    try {
      await this._ready(); // Called directly from the user's click/key event.
      const [, ambientBuffers] = await Promise.all([
        prepareInstruments(this.context, arrangement.steps.flatMap(step => step.notes.map(note => note.instrument))),
        loadSoundscape(this.context, this.ambienceChoice)
      ]);
      if (generation !== this.generation) return false;
      this.ambienceBuffers = ambientBuffers;
      for (const id of new Set(arrangement.steps.flatMap(step => step.notes.map(note => note.instrument)))) this.samples.set(id, await getSamples(this.context, id));
      if (generation !== this.generation) return false;
      this.lastRequest = request;
      this.status = 'playing'; this._startAmbience(); this._tick();
      return true;
    } catch (error) {
      if (generation === this.generation) { this.status = 'stopped'; this._emit(); }
      throw error;
    }
  }
  playArrangement(dataset, options = {}) {
    return this._begin(buildArrangement(dataset, options), { kind: 'arrangement', dataset, options });
  }
  playSequence(dataset, options = {}) {
    const instrument = options.instrument ?? 'piano';
    const multi = singleToMulti(dataset, instrument);
    const arrangement = buildArrangement(multi, { order: 'category', playback: 'points', style: options.style ?? 'acoustic' });
    if (options.durationMs || options.gapMs !== undefined) arrangement.steps.forEach(step => {
      step.durationMs = options.durationMs ?? step.durationMs;
      step.waitMs = step.durationMs + (options.gapMs ?? 140);
    });
    return this._begin(arrangement, { kind: 'sequence', dataset, options });
  }
  playNote(point, dataset, options = {}) {
    const checked = validateDataset(dataset);
    const index = typeof point === 'number' ? point : dataset.data.indexOf(point);
    if (!Number.isInteger(index) || index < 0 || index >= checked.data.length) throw new RangeError('Point is not in the dataset.');
    const instrument = options.instrument ?? 'piano';
    const multi = singleToMulti(dataset, instrument);
    const arrangement = buildArrangement(multi, { playback: 'points', style: options.style ?? 'acoustic' });
    arrangement.steps = [arrangement.steps[index]];
    arrangement.steps[0].durationMs = options.durationMs ?? 500;
    arrangement.steps[0].waitMs = arrangement.steps[0].durationMs + 120;
    return this._begin(arrangement, { kind: 'note', point: index, dataset, options }, true);
  }
  pause() {
    if (this.status !== 'playing') return false;
    const now = performance.now();
    this.remainingMs = Math.max(0, this.deadline - now);
    this.remainingNoteMs = Math.max(0, this.noteDeadline - now);
    for (const layer of this.ambientSources) {
      this.ambientOffsets[layer.id] = (layer.offset + Math.max(0, this.context.currentTime - layer.startedAt)) % layer.buffer.duration;
    }
    this.generation += 1; this._silence(); this.status = 'paused'; this._emit();
    return true;
  }
  async resume() {
    if (this.status !== 'paused') return false;
    const generation = this.generation;
    await this._ready();
    if (generation !== this.generation || this.status !== 'paused') return false;
    this.status = 'playing'; this._startAmbience(); this._tick(this.remainingNoteMs, this.remainingMs);
    return true;
  }
  replay() {
    if (!this.lastRequest) return false;
    const request = this.lastRequest;
    if (request.kind === 'arrangement') return this.playArrangement(request.dataset, request.options);
    if (request.kind === 'sequence') return this.playSequence(request.dataset, request.options);
    return this.playNote(request.point, request.dataset, request.options);
  }
  stopAudio() {
    this.generation += 1; this._silence(); this.ambientOffsets = {}; this.status = 'stopped'; this.remainingMs = 0; this._emit();
  }
  async dispose() {
    this.stopAudio();
    const context = this.context; this.context = null; this.samples.clear();
    if (context && context.state !== 'closed') await context.close();
  }
}
export const audioEngine = new AudioEngine();
export const playSequence = (dataset, options) => audioEngine.playSequence(dataset, options);
export const playNote = (point, dataset, options) => audioEngine.playNote(point, dataset, options);
export const stopAudio = () => audioEngine.stopAudio();
export const pauseAudio = () => audioEngine.pause();
export const resumeAudio = () => audioEngine.resume();
export const replayAudio = () => audioEngine.replay();
