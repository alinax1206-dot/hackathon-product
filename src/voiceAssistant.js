export const VOICE_SILENCE_MS = 3000;

export function recognizedLocalIntent(text) {
  const value = String(text).trim().toLowerCase();
  if (/\b(go )?home\b/.test(value)) return "home";
  if (
    /\b(creator|create|teacher) mode\b|\bprepare (a )?(chart|dataset|material)\b/.test(
      value,
    )
  )
    return "creator";
  if (
    /\b(user|learner|student) mode\b|\b(open|show) (the )?(materials|library)\b/.test(
      value,
    )
  )
    return "user";
  if (/\b(play|start) (the )?music\b/.test(value)) return "play-music";
  if (/\b(overview|summary|summarize|describe the chart)\b/.test(value))
    return "overview";
  if (/\b(play|start) (the )?(data|sequence|sonification)\b/.test(value))
    return "play-data";
  if (/\b(stop|cancel) (the )?(audio|music|playback)\b/.test(value))
    return "stop-audio";
  if (/\bnext (data )?point\b/.test(value)) return "next-point";
  if (/\bprevious (data )?point\b/.test(value)) return "previous-point";
  if (/\bfirst (data )?point\b/.test(value)) return "first-point";
  if (/\blast (data )?point\b/.test(value)) return "last-point";
  if (/\bread (the )?(current |selected )?(value|point)\b/.test(value))
    return "read-point";
  if (
    /\b(upload|open|choose|learn|explore)\b.*\.(csv|xlsx)\b|\b(upload|choose) (a )?(file|spreadsheet)\b/.test(
      value,
    )
  )
    return "choose-file";
  return null;
}

export class VoiceAssistant {
  constructor({
    getContext,
    handleIntent,
    speak,
    stopPlayback,
    requestRender,
  }) {
    Object.assign(this, {
      getContext,
      handleIntent,
      speak,
      stopPlayback,
      requestRender,
    });
    this.open = false;
    this.listening = false;
    this.busy = false;
    this.speaking = false;
    this.autoSpeak = true;
    this.draft = "";
    this.messages = [
      {
        role: "assistant",
        content:
          "Hi, I’m your ChartAloud guide. Ask me to open a mode, help import data, or explain the chart you are exploring.",
      },
    ];
  }

  html(escape) {
    const messages = this.messages
      .map(
        (message) =>
          `<div class="assistant-message ${message.role}"><span>${message.role === "assistant" ? "Guide" : "You"}</span><p>${escape(message.content)}</p></div>`,
      )
      .join("");
    return `<div class="voice-assistant ${this.open ? "is-open" : ""}" aria-label="AI voice assistant">
      <button type="button" id="assistant-toggle" class="assistant-launcher" aria-label="Talk to ChartAloud" aria-expanded="${this.open}" aria-controls="assistant-panel"><chat-mascot state="${this.motionState}" src="/motion/mascot.webp" aria-hidden="true"></chat-mascot><span>Talk to ChartAloud</span></button>
      <section id="assistant-panel" class="assistant-panel" ${this.open ? "" : "hidden"}>
        <header class="assistant-heading"><div><strong>ChartAloud Guide</strong><small>Voice and text · English</small></div><button type="button" id="assistant-close" aria-label="Close voice assistant">×</button></header>
        <div id="assistant-messages" class="assistant-messages" role="log" aria-live="polite" aria-relevant="additions">${messages}${this.busy ? '<div class="assistant-thinking">Thinking…</div>' : ""}</div>
        <p id="assistant-status" class="assistant-status">${this.listening ? "Listening. Pause for 3 seconds to send." : this.busy ? "Preparing an answer." : "Ask about this page or the current data."}</p>
        <form id="assistant-form" class="assistant-form">
          <label class="sr-only" for="assistant-input">Ask ChartAloud</label>
          <input id="assistant-input" type="text" maxlength="1200" autocomplete="off" value="${escape(this.draft)}" placeholder="Ask about this page…" ${this.busy ? "disabled" : ""}>
          <button type="button" id="assistant-mic" class="assistant-mic ${this.listening ? "is-listening" : ""}" aria-pressed="${this.listening}" ${this.busy ? "disabled" : ""}>${this.listening ? "Stop" : "Mic"}</button>
          <button type="submit" class="assistant-send" ${this.busy ? "disabled" : ""}>Send</button>
        </form>
        <label class="assistant-autospeak"><input id="assistant-autospeak" type="checkbox" ${this.autoSpeak ? "checked" : ""}> Speak answers automatically</label>
        <p class="assistant-privacy">Only the question and current prepared chart context are sent to AI. Your source file stays in this browser.</p>
      </section>
    </div>`;
  }

  get motionState() {
    return this.listening
      ? "listening"
      : this.busy
        ? "thinking"
        : this.speaking
          ? "speaking"
          : "idle";
  }

  syncMotion() {
    document
      .querySelectorAll(".voice-assistant chat-mascot")
      .forEach((mascot) => mascot.setState(this.motionState));
  }

  setSpeaking(value) {
    this.speaking = value;
    this.syncMotion();
  }

  speakAnswer(answer) {
    this.setSpeaking(true);
    this.speak(answer, () => this.setSpeaking(false));
  }

  welcomeMode(mode) {
    const greeting = mode === "home"
      ? "Hi! Welcome to ChartAloud. Would you like Creator Mode or User Mode?"
      : "Hi! Enter a class code, or continue a recent lesson when you are ready.";
    this.open = false;
    this.messages = [{ role: "assistant", content: greeting }];
    this.busy = false;
    this.requestRender();
    queueMicrotask(() => this.speakAnswer(greeting));
  }

  welcome(title, speak = false) {
    this.open = false;
    this.messages = [
      {
        role: "assistant",
        content: `Hi! I'm here to explore ${title} with you. What would you like to know? Ask for an overview whenever you're ready.`,
      },
    ];
    this.busy = false;
    this.requestRender();
    if (speak)
      queueMicrotask(() => this.speakAnswer("Hi! I'm here whenever you're ready. What would you like to explore?"));
  }

  bind(root = document) {
    const toggle = () => {
      this.open = !this.open;
      this.requestRender();
      if (this.open)
        queueMicrotask(() =>
          document.querySelector("#assistant-input")?.focus(),
        );
    };
    root.querySelector("#assistant-toggle")?.addEventListener("click", () => {
      this.open = true;
      this.startListening();
    });
    root.querySelector("#assistant-close")?.addEventListener("click", toggle);
    root.querySelector("#assistant-header")?.addEventListener("click", () => {
      this.open = true;
      this.requestRender();
      queueMicrotask(() => document.querySelector("#assistant-input")?.focus());
    });
    const input = root.querySelector("#assistant-input");
    if (input)
      input.addEventListener("input", () => (this.draft = input.value));
    root
      .querySelector("#assistant-form")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        this.submit(this.draft);
      });
    root.querySelector("#assistant-mic")?.addEventListener("click", () => {
      if (this.listening) this.finishListening(true);
      else this.startListening();
    });
    root
      .querySelector("#assistant-autospeak")
      ?.addEventListener("change", (event) => {
        this.autoSpeak = event.target.checked;
      });
    const log = root.querySelector("#assistant-messages");
    if (log) log.scrollTop = log.scrollHeight;
  }

  startListening() {
    const Recognition =
      globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    this.open = true;
    if (!Recognition) {
      this.addAnswer(
        "Voice input is not supported in this browser. You can type your question instead.",
        false,
      );
      return;
    }
    this.stopPlayback();
    this.speaking = false;
    this.cancelListening(false);
    this.transcript = "";
    this.hadSpeech = false;
    this.shouldSubmitAfterEnd = false;
    const recognition = new Recognition();
    this.recognition = recognition;
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      this.hadSpeech = true;
      let finalText = "";
      let interimText = "";
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index++
      ) {
        const text = event.results[index][0]?.transcript || "";
        if (event.results[index].isFinal) finalText += text;
        else interimText += text;
      }
      if (finalText.trim())
        this.transcript = `${this.transcript} ${finalText}`.trim();
      this.draft = `${this.transcript} ${interimText}`.trim();
      const input = document.querySelector("#assistant-input");
      if (input) input.value = this.draft;
      const status = document.querySelector("#assistant-status");
      if (status)
        status.textContent = "Listening. Pause for 3 seconds to send.";
      clearTimeout(this.silenceTimer);
      this.silenceTimer = setTimeout(
        () => this.finishListening(true),
        VOICE_SILENCE_MS,
      );
    };
    recognition.onerror = (event) => {
      clearTimeout(this.silenceTimer);
      if (["aborted", "no-speech"].includes(event.error)) return;
      this.listening = false;
      this.recognition = null;
      this.addAnswer(
        event.error === "not-allowed"
          ? "Microphone access is blocked. Allow microphone access in the browser, then try again."
          : "I could not hear that clearly. Please try the microphone again or type your question.",
        false,
      );
    };
    recognition.onend = () => {
      clearTimeout(this.silenceTimer);
      const submit = this.shouldSubmitAfterEnd || this.hadSpeech;
      this.listening = false;
      this.recognition = null;
      this.shouldSubmitAfterEnd = false;
      if (submit && this.draft.trim()) this.submit(this.draft);
      else this.requestRender();
    };
    try {
      recognition.start();
      this.listening = true;
      this.requestRender();
    } catch {
      this.listening = false;
      this.recognition = null;
      this.addAnswer(
        "The microphone could not start. Please try again or type your question.",
        false,
      );
    }
  }

  finishListening(submit) {
    if (!this.recognition) {
      if (submit && this.draft.trim()) this.submit(this.draft);
      return;
    }
    clearTimeout(this.silenceTimer);
    this.shouldSubmitAfterEnd = submit;
    try {
      this.recognition.stop();
    } catch {
      this.cancelListening(false);
    }
  }

  cancelListening(render = true) {
    clearTimeout(this.silenceTimer);
    this.shouldSubmitAfterEnd = false;
    if (this.recognition) {
      const recognition = this.recognition;
      this.recognition = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {}
    }
    this.listening = false;
    this.syncMotion();
    if (render) this.requestRender();
  }

  cancelRequest() {
    this.requestController?.abort();
    this.requestController = null;
    if (this.busy) {
      this.busy = false;
      this.requestRender();
    }
  }

  addAnswer(answer, speak = this.autoSpeak) {
    this.messages.push({ role: "assistant", content: answer });
    this.messages = this.messages.slice(-12);
    this.busy = false;
    this.requestRender();
    if (speak) queueMicrotask(() => this.speakAnswer(answer));
  }

  async submit(rawText) {
    const text = String(rawText || "").trim();
    if (!text || this.busy) return;
    this.cancelListening(false);
    this.open = true;
    this.draft = "";
    this.messages.push({ role: "user", content: text });
    this.messages = this.messages.slice(-12);
    this.busy = true;
    this.requestRender();
    try {
      const localAnswer = await this.handleIntent(
        recognizedLocalIntent(text),
        text,
      );
      if (localAnswer) {
        if (typeof localAnswer === "string") this.addAnswer(localAnswer);
        else
          this.addAnswer(
            localAnswer.answer,
            localAnswer.speak !== false && this.autoSpeak,
          );
        return;
      }
      const controller = new AbortController();
      this.requestController = controller;
      const history = this.messages.slice(0, -1).slice(-6);
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message: text,
          history,
          context: this.getContext(),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Assistant request failed.");
      if (typeof result.answer !== "string" || !result.answer.trim())
        throw new Error("The assistant returned an empty answer.");
      this.requestController = null;
      this.addAnswer(result.answer.trim());
    } catch (error) {
      if (error.name === "AbortError") return;
      this.requestController = null;
      this.addAnswer(
        error.message ||
          "The assistant is unavailable. The rest of ChartAloud still works.",
        false,
      );
    }
  }
}
