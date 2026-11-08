// Local Vite-development-only AI proxy. Never expose API keys to a browser.
const TINKER_URL =
  "https://tinker.thinkingmachines.dev/services/tinker-prod/oai/api/v1/chat/completions";
const MAX_POINTS = 1000;
const MAX_BODY_BYTES = 64000;
const MUSIC_STYLES = [
  "acoustic",
  "luminous",
  "chamber",
  "electric",
  "jazz",
  "folk",
  "cinematic",
  "playful",
];

export function summarizeValues(values) {
  if (
    !Array.isArray(values) ||
    values.length < 2 ||
    values.length > MAX_POINTS ||
    !values.every(
      (value) => typeof value === "number" && Number.isFinite(value),
    )
  ) {
    throw new TypeError(
      `Expected 2–${MAX_POINTS} finite numbers in one selected data column.`,
    );
  }
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = (fraction) => {
    const position = fraction * (sorted.length - 1);
    const left = Math.floor(position);
    const weight = position - left;
    return (
      sorted[left] * (1 - weight) +
      sorted[Math.min(sorted.length - 1, left + 1)] * weight
    );
  };
  const min = sorted[0],
    max = sorted.at(-1);
  const scale = Math.max(Math.abs(min), Math.abs(max)) || 1;
  const normalized = (value) =>
    max === min
      ? 0.5
      : (value / scale - min / scale) / (max / scale - min / scale);
  const differences = values
    .slice(1)
    .map((value, index) => normalized(value) - normalized(values[index]));
  const round = (value) => Math.round(value * 1000) / 1000;
  return {
    count: values.length,
    min,
    q1: quantile(0.25),
    median: quantile(0.5),
    q3: quantile(0.75),
    max,
    lowerHalfSpanFraction: round(normalized(quantile(0.5))),
    upperQuartileFraction: round(normalized(quantile(0.75))),
    overallChangeFraction: round(
      normalized(values.at(-1)) - normalized(values[0]),
    ),
    averageStepFraction: round(
      differences.reduce((total, step) => total + Math.abs(step), 0) /
        differences.length,
    ),
    directionChanges: differences
      .slice(1)
      .filter((step, index) => step * differences[index] < 0).length,
  };
}

export function validateSuggestion(value) {
  if (
    !value ||
    !["linear", "contrast"].includes(value.mapping) ||
    typeof value.reason !== "string" ||
    !value.reason.trim() ||
    value.reason.length > 350 ||
    (value.style != null && !MUSIC_STYLES.includes(value.style))
  ) {
    throw new TypeError("AI returned an invalid mapping suggestion.");
  }
  return {
    mapping: value.mapping,
    style: value.style || "acoustic",
    reason: value.reason.trim(),
  };
}

async function parseRequest(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > MAX_BODY_BYTES)
      throw new TypeError("Dataset request is too large.");
  }
  let input;
  try {
    input = JSON.parse(body);
  } catch {
    throw new TypeError("Expected JSON request.");
  }
  return summarizeValues(input?.values);
}

export function createSoundAdvisorMiddleware({
  getTinkerApiKey = () => process.env.TINKER_API_KEY,
  getTinkerModelPath = () => process.env.TINKER_MODEL_PATH,
  fetchImpl = globalThis.fetch,
} = {}) {
  return async function soundAdvisor(req, res) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const respond = (status, value) => {
      res.statusCode = status;
      res.end(JSON.stringify(value));
    };
    if (req.method !== "POST")
      return respond(405, { error: "Use POST for AI recommendations." });
    try {
      const stats = await parseRequest(req);
      const apiKey = getTinkerApiKey();
      if (!apiKey || apiKey === "paste_your_api_key_here") {
        return respond(503, {
          error:
            "Tinker API key missing. Set TINKER_API_KEY in .env.local, then restart npm run dev.",
        });
      }
      if (stats.min === stats.max) {
        return respond(200, {
          mapping: "linear",
          style: "acoustic",
          reason:
            "All values are identical, so changing the pitch curve cannot create meaningful differences.",
        });
      }
      const prompt = `You are choosing a sound setup for an audio-first data prototype. The selected column has these VERIFIED summary statistics (no raw dataset, title, or category labels are supplied): ${JSON.stringify(stats)}.\n\nChoose one pitch mapping for a 220–660 Hz data-note range:\n- linear: proportional spacing; default.\n- contrast: square-root transform that emphasizes low-end differences and compresses high-end spacing. Use only when values cluster near the minimum with a relatively high outlier.\n\nChoose one music style from: acoustic (warm and gentle), luminous (airy and slow), chamber (measured), electric (soft and steady), jazz (relaxed), folk (steady), cinematic (slow and spacious), playful (bright and quick). Use the numerical spread, average step, overall change, and direction changes to make a specific listening choice. Do not default to chamber unless its measured pace fits these statistics. A music style is subjective, not a fact about the data's topic.\n\nReturn mapping, style, and one short reason tied to a supplied statistic in plain English. Do not claim user-tested accessibility gains or invent raw values or topics.`;
      const model = getTinkerModelPath();
      if (
        typeof model !== "string" ||
        !/^tinker:\/\/\S+$/.test(model) ||
        model.length > 500
      ) {
        throw new TypeError(
          "Invalid Tinker model path. Set TINKER_MODEL_PATH to a full tinker:// sampler checkpoint path.",
        );
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let response;
      try {
        response = await fetchImpl(TINKER_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "user",
                content: `${prompt}\n\nReply with only a JSON object containing mapping, style, and reason.`,
              },
            ],
            max_tokens: 512,
            reasoning_effort: "low",
          }),
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) {
        console.error("Tinker returned HTTP", response.status);
        return respond(502, {
          error: `Tinker request failed (HTTP ${response.status}). Check your API key, model access, and quota.`,
        });
      }
      const output = await response.json();
      const text = output?.choices?.[0]?.message?.content;
      const recommendation = validateSuggestion(JSON.parse(text || "null"));
      return respond(200, recommendation);
    } catch (error) {
      if (
        error instanceof TypeError &&
        /^(Expected|Dataset request|Invalid Tinker)/.test(error.message)
      ) {
        return respond(400, { error: error.message });
      }
      console.error("AI advisor error:", error?.name || "unknown");
      return respond(502, {
        error:
          "AI recommendation unavailable. Linear sonification still works; try again later.",
      });
    }
  };
}
