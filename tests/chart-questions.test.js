import test from "node:test";
import assert from "node:assert/strict";
import { answerChartQuestion } from "../src/chartQuestions.js";

const dataset = {
  unit: "°C",
  decimalPlaces: 2,
  data: [
    { label: "Day 1", value: -4.5 },
    { label: "Day 2", value: 0 },
    { label: "Day 3", value: 18.7 },
    { label: "Day 4", value: 18.7 },
  ],
};

test("chart extrema use exact prepared values, units, formatting and all ties", () => {
  assert.equal(
    answerChartQuestion(
      "can you tell me the highest value in the chart",
      dataset,
    ),
    "The highest value is 18.70 °C, at Day 3, Day 4 (tied).",
  );
  assert.equal(
    answerChartQuestion("What is the lowest value?", dataset),
    "The lowest value is -4.50 °C, at Day 1.",
  );
  assert.equal(
    answerChartQuestion("maximum?", {
      aggregation: "count",
      unit: "",
      data: [{ label: "A", value: 3 }],
    }),
    "The highest value is 3, at A.",
  );
});

test("interpretations, changes and missing data are left to the assistant", () => {
  for (const question of [
    "Why is the highest value so high?",
    "What is the biggest change?",
    "Compare the maximum and minimum",
    "What is the trend?",
  ])
    assert.equal(answerChartQuestion(question, dataset), null);
  assert.equal(answerChartQuestion("highest?", null), null);
  assert.equal(answerChartQuestion("highest?", { data: [] }), null);
});
