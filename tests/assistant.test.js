import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import {
  createAssistantMiddleware,
  sanitizeAssistantRequest,
} from "../server/ai-assistant.js";
import {
  VOICE_SILENCE_MS,
  recognizedLocalIntent,
} from "../src/voiceAssistant.js";
import { chooseGuideVoice } from "../src/playback.js";

test("guide prefers a natural female voice and honors the learner's choice", () => {
  const voices = [
    { name: "Fred", lang: "en-US", default: true },
    { name: "Samantha", lang: "en-US" },
    { name: "Karen", lang: "en-AU" },
  ];
  assert.equal(chooseGuideVoice(voices)?.name, "Samantha");
  assert.equal(chooseGuideVoice(voices, "Karen")?.name, "Karen");
  assert.equal(chooseGuideVoice(voices, "Missing")?.name, "Samantha");
  assert.equal(chooseGuideVoice([{ name: "Other", lang: "zh-CN" }]), null);
});

async function call(app, body) {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = "POST";
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(value) {
      this.body = JSON.parse(value);
    },
  };
  await app(req, res);
  return res;
}

test("voice input uses a three-second silence window and recognizes safe local actions", () => {
  assert.equal(VOICE_SILENCE_MS, 3000);
  assert.equal(recognizedLocalIntent("Open Creator Mode"), "creator");
  assert.equal(
    recognizedLocalIntent("I want to learn rainfall.csv"),
    "choose-file",
  );
  assert.equal(recognizedLocalIntent("Play the music"), "play-music");
  assert.equal(recognizedLocalIntent("What is the biggest change?"), null);
});

test("assistant context accepts prepared points and drops unrelated properties", () => {
  const input = sanitizeAssistantRequest({
    message: "Where is the maximum?",
    context: {
      page: "data explorer",
      sourceRows: [{ secret: "must not pass" }],
      dataset: {
        title: "Rain",
        xAxis: "City",
        yAxis: "Rainfall",
        data: [
          { label: "Seattle", value: 95, hidden: "drop" },
          { label: "Denver", value: 28 },
        ],
      },
    },
  });
  assert.equal(input.context.dataset.data[0].value, 95);
  assert.equal("sourceRows" in input.context, false);
  assert.equal("hidden" in input.context.dataset.data[0], false);
});

test("mock Tinker assistant receives verified context and returns spoken text", async () => {
  let request;
  const app = createAssistantMiddleware({
    getTinkerApiKey: () => "test-key",
    getTinkerModelPath: () => "tinker://test:train:0/sampler_weights/sample",
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "Seattle is the highest point at 95 inches.",
              },
            },
          ],
        }),
      };
    },
  });
  const result = await call(app, {
    message: "Where is the maximum?",
    context: {
      page: "data explorer",
      mode: "user",
      dataset: {
        title: "Rain",
        xAxis: "City",
        yAxis: "Rainfall",
        unit: "inches",
        selectedIndex: 0,
        data: [
          { label: "Seattle", value: 95 },
          { label: "Denver", value: 28 },
        ],
      },
    },
  });
  assert.equal(result.statusCode, 200);
  assert.equal(
    result.body.answer,
    "Seattle is the highest point at 95 inches.",
  );
  assert.equal(request.max_tokens, 220);
  assert.match(result.headers["Server-Timing"], /assistant;dur=\d+/);
  assert.match(result.headers["Server-Timing"], /tinker;dur=\d+/);
  assert.match(result.headers["X-Tinker-Elapsed-Ms"], /^\d+$/);
  assert.match(result.headers["X-Assistant-Elapsed-Ms"], /^\d+$/);
  assert.match(request.messages.at(-1).content, /Seattle/);
  assert.match(request.messages[0].content, /untrusted data/);
});

test("assistant reports an upstream timeout clearly", async () => {
  const unavailable = createAssistantMiddleware({
    getTinkerApiKey: () => "test-key",
    getTinkerModelPath: () => "tinker://test:train:0/sampler_weights/sample",
    fetchImpl: async () => {
      throw Object.assign(new Error("request timed out"), {
        name: "AbortError",
      });
    },
  });
  const response = await call(unavailable, { message: "Explain the chart." });
  assert.equal(response.statusCode, 504);
  assert.match(response.body.error, /within 20 seconds/);
});

test("missing Tinker key is reported without contacting the API", async () => {
  const unavailable = createAssistantMiddleware({
    getTinkerApiKey: () => "",
  });
  const response = await call(unavailable, { message: "Hello", context: {} });
  assert.equal(response.statusCode, 503);
  assert.match(response.body.error, /TINKER_API_KEY/);
});

test("blocked network returns actionable diagnostics without leaking secrets", async () => {
  const app = createAssistantMiddleware({
    getTinkerApiKey: () => "private-test-key",
    getTinkerModelPath: () => "tinker://test:train:0/sampler_weights/sample",
    fetchImpl: async () => {
      throw new TypeError("fetch failed", {
        cause: new AggregateError([
          Object.assign(new Error("private-test-key"), { code: "EACCES" }),
        ]),
      });
    },
  });
  const result = await call(app, { message: "Explain the pattern." });
  assert.equal(result.statusCode, 502);
  assert.equal(result.body.code, "AI_NETWORK_BLOCKED");
  assert.match(result.body.error, /network permissions/);
  assert.doesNotMatch(JSON.stringify(result.body), /private-test-key/);
});
