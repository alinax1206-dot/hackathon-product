import { AudioEngine } from "./audioEngine.js";
// One owner for speech, oscillator notes, recorded music, and cancellation tokens.
export class Playback {
  constructor({ onPoint, onStatus, onError }) {
    Object.assign(this, { onPoint, onStatus, onError });
    this.generation = 0;
    this.nodes = new Set();
    this.status = "stopped";
    this.index = 0;
    this.playedDatasets = new WeakSet();
    this.engine = new AudioEngine({
      onStateChange: ({ status, rowIndex }) => {
        if (this.kind !== "music") return;
        this.onStatus(
          status === "loading"
            ? "Loading instrument recordings…"
            : status === "playing"
              ? "Playing your data as music."
              : status === "paused"
                ? "Music paused."
                : "Ready to play.",
        );
        if (status === "playing" && rowIndex != null) this.onPoint(rowIndex);
      },
    });
  }
  dataLabel(dataset) {
    return dataset && this.playedDatasets.has(dataset)
      ? "Replay data"
      : "Play data";
  }
  get pauseLabel() {
    return (this.kind === "sequence" && this.status === "paused") ||
      (this.kind === "music" && this.engine.status === "paused")
      ? "Resume"
      : "Pause";
  }
  get canPause() {
    return (
      (this.kind === "sequence" &&
        ["playing", "paused"].includes(this.status)) ||
      (this.kind === "music" &&
        ["playing", "paused"].includes(this.engine.status))
    );
  }
  get musicLabel() {
    if (this.kind === "music" && this.engine.status === "playing")
      return "Pause music";
    if (this.kind === "music" && this.engine.status === "paused")
      return "Resume music";
    return "Play as music";
  }
  toggleData(dataset) {
    if (this.kind === "sequence") this.toggle(dataset);
    else this.sequence(dataset);
  }
  stop(completed = false) {
    this.completed = completed;
    this.generation++;
    clearTimeout(this.timer);
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {}
    }
    this.nodes.clear();
    this.kind = null;
    this.status = "stopped";
    this.engine.stopAudio();
    globalThis.speechSynthesis?.cancel();
    this.onStatus("Ready to play.");
  }
  speak(text, enabled) {
    this.stop();
    if (!enabled) return;
    if (!globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance) {
      this.onError(
        "Spoken values are unavailable in this browser. All instructions and values are available on screen.",
      );
      return;
    }
    try {
      const token = this.generation;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.voice =
        speechSynthesis.getVoices().find((v) => /^en[-_]/i.test(v.lang)) ??
        null;
      utterance.onerror = (e) => {
        if (
          token === this.generation &&
          !["canceled", "interrupted"].includes(e.error)
        )
          this.onError(
            "Speech could not start. Press Read exact value to retry, or read the visible value.",
          );
      };
      this.kind = "speech";
      this.status = "speaking";
      utterance.onend = () => {
        if (token === this.generation) {
          this.kind = null;
          this.status = "stopped";
          this.onStatus("Ready to play.");
        }
      };
      this.onStatus("Reading exact value.");
      speechSynthesis.speak(utterance);
    } catch {
      this.onError(
        "Speech is unavailable. Use the visible instructions and values.",
      );
    }
  }
  async note(value, dataset, token = this.generation) {
    try {
      const Constructor =
        globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Constructor)
        throw new Error("This browser does not support Web Audio.");
      this.context ??= new Constructor();
      await this.context.resume();
      if (token !== this.generation) return;
      if (this.context.state && this.context.state !== "running")
        throw new Error("Audio is blocked. Press a playback button to retry.");
      const values = dataset.data.map((p) => p.value),
        min = Math.min(...values),
        max = Math.max(...values);
      const scale = Math.max(Math.abs(min), Math.abs(max)) || 1;
      const pitch =
        max === min
          ? 0.5
          : (value / scale - min / scale) / (max / scale - min / scale);
      const osc = this.context.createOscillator(),
        gain = this.context.createGain(),
        at = this.context.currentTime;
      osc.type = "sine";
      osc.frequency.value = 220 * 2 ** (pitch * 2);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.16, at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.6);
      osc.connect(gain).connect(this.context.destination);
      osc.start(at);
      osc.stop(at + 0.65);
      this.nodes.add(osc);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
        this.nodes.delete(osc);
      };
    } catch (e) {
      if (token === this.generation) {
        this.stop();
        this.onError(e.message);
      }
    }
  }
  point(index, dataset) {
    this.stop();
    this.note(dataset.data[index].value, dataset);
  }
  sequence(dataset) {
    this.stop();
    this.playedDatasets.add(dataset);
    this.kind = "sequence";
    this.dataset = dataset;
    this.index = 0;
    this.status = "playing";
    this.tick();
  }
  tick() {
    const token = this.generation;
    this.onPoint(this.index);
    this.onStatus("Playing data sequence.");
    this.note(this.dataset.data[this.index].value, this.dataset, token);
    this.timer = setTimeout(() => {
      if (token !== this.generation || this.status !== "playing") return;
      if (++this.index < this.dataset.data.length) this.tick();
      else {
        this.stop(true);
        this.onStatus("Data sequence finished.");
      }
    }, 800);
  }
  toggle(dataset) {
    if (this.kind === "music") {
      if (this.engine.status === "paused")
        this.engine.resume().catch((e) => this.onError(e.message));
      else if (this.engine.status === "playing") this.engine.pause();
      return;
    }
    if (this.status === "playing") {
      this.generation++;
      clearTimeout(this.timer);
      for (const n of this.nodes) {
        try {
          n.stop();
        } catch {}
      }
      this.nodes.clear();
      this.status = "paused";
      this.onStatus("Sequence paused.");
    } else if (this.status === "paused") {
      this.status = "playing";
      this.tick();
    } else this.sequence(dataset);
  }
  music(dataset, style) {
    this.stop();
    this.kind = "music";
    const token = this.generation;
    this.engine
      .playArrangement(
        {
          title: dataset.title,
          xAxis: dataset.xAxis,
          series: [{ key: dataset.yAxis }],
          data: dataset.data.map((p) => ({
            label: p.label,
            values: { [dataset.yAxis]: p.value },
          })),
        },
        { playback: "music", style },
      )
      .catch((e) => {
        if (token === this.generation) this.onError(e.message);
      });
  }
}
