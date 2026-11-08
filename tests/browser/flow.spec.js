import { uploadRainfall } from "./upload-helper.js";
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.audioEvents = [];
    const record = (event) => window.audioEvents.push(event);
    window.speechSynthesis.cancel = () => record("cancelSpeech");
    window.speechSynthesis.speak = (utterance) =>
      record({ speech: utterance.text, lang: utterance.lang });
    window.AudioContext = class {
      currentTime = 0;
      destination = {};
      resume() {
        record("resume");
      }
      createOscillator() {
        return {
          frequency: {},
          connect() {
            return this;
          },
          disconnect() {},
          start() {
            record("startNote");
          },
          stop() {
            record("stopNote");
          },
        };
      }
      createGain() {
        return {
          gain: {
            setValueAtTime() {},
            linearRampToValueAtTime() {},
            exponentialRampToValueAtTime() {},
          },
          connect() {
            return this;
          },
          disconnect() {},
        };
      }
    };
  });
  await page.goto("/");
});

test("sample mapping, keyboard, point cues, English speech and edit cancellation", async ({
  page,
}) => {
  await page.getByRole("button", { name: /Creator Mode/ }).click();
  await uploadRainfall(page);
  await page
    .getByRole("button", { name: "Validate mapping and continue" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Enter a unit");
  await page.getByLabel("No unit", { exact: true }).check();
  await page
    .getByRole("button", { name: "Validate mapping and continue" })
    .click();
  await expect(page.locator(".studio-screen #explorer")).toBeVisible();
  await page.locator("#explorer").focus();
  await page.keyboard.press("r");
  await page.keyboard.press("ArrowRight");
  await page.locator("#explorer").focus();
  await page.keyboard.press("r");
  expect(
    await page.evaluate(
      () => audioEvents.filter((e) => e === "startNote").length,
    ),
  ).toBeGreaterThanOrEqual(2);
  await page.keyboard.press("Escape");
  const starts = await page.evaluate(
    () => audioEvents.filter((e) => e === "startNote").length,
  );
  await page.waitForTimeout(900);
  expect(
    await page.evaluate(
      () => audioEvents.filter((e) => e === "startNote").length,
    ),
  ).toBe(starts);
  await page.locator("#explorer").focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#explorer")).toBeFocused();
  await expect(page.locator("#selected-label")).toHaveText("Portland");
  await page.keyboard.press("Enter");
  await page.locator("#explorer").focus();
  await page.keyboard.press("Enter");
  expect(
    await page.evaluate(() =>
      audioEvents.filter((e) => typeof e === "object").at(-1),
    ),
  ).toMatchObject({ lang: "en-US" });
  await page.getByRole("button", { name: "02 Map" }).click();
  await page.getByLabel("Value to hear").selectOption("City");
  await page
    .getByRole("button", { name: "Validate mapping and continue" })
    .click();
  await expect(page.getByRole("alert")).toContainText("different");
});

test("XLSX sheet choice, duplicate validation, aggregation, invalid rows and explicit partial range", async ({
  page,
}) => {
  await page.getByRole("button", { name: /Creator Mode/ }).click();
  await page.locator("#file").setInputFiles("tests/fixtures/workbook.xlsx");
  await expect(page.locator(".detected-format")).toContainText("Excel (.xlsx)");
  await expect(page.getByLabel("Worksheet")).toHaveValue("");
  await page.getByLabel("Worksheet").selectOption("Records");
  await expect(page.getByLabel("Value to hear")).toHaveValue("amount");
  await page.getByLabel("No unit", { exact: true }).check();
  await page
    .getByRole("button", { name: "Validate mapping and continue" })
    .click();
  await expect(page.locator("#aggregation-error")).toContainText("repeated categories");
  await page.getByRole("button", { name: "01 Import" }).click();
  await page.getByRole("button", { name: "02 Map" }).click();
  await expect(page.getByLabel("Worksheet")).toHaveValue("Records");
  await expect(page.getByLabel("Value to hear")).toHaveValue("amount");
  for (const aggregation of ["sum", "mean", "count"]) {
    await page.getByLabel("Repeated categories").selectOption(aggregation);
    if (aggregation === "count")
      await expect(page.locator("#y")).toBeDisabled();
    await page
      .getByRole("button", { name: "Validate mapping and continue" })
      .click();
    await expect(page.locator(".studio-screen #explorer")).toBeVisible();
    await page.getByRole("button", { name: "02 Map" }).click();
  }
  await page.getByLabel("Worksheet").selectOption("Invalid");
  await page.getByLabel("Value to hear").selectOption("Value");
  await page.getByLabel("No unit", { exact: true }).check();
  await page
    .getByRole("button", { name: "Validate mapping and continue" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Row 2 (Value): blank");
  await expect(page.getByRole("alert")).toContainText(
    "Row 3 (Value): non-numeric",
  );
  await expect(page.getByRole("alert")).toContainText(
    "Row 4 (Value): non-finite",
  );
  await page.getByLabel("Worksheet").selectOption("Long series");
  await page.getByLabel("Unit", { exact: true }).fill("mm");
  await page
    .getByRole("button", { name: "Validate mapping and continue" })
    .click();
  await expect(page.getByLabel("First point (inclusive)")).toHaveValue("1");
  await page.getByLabel("First point (inclusive)").fill("1");
  await page.getByLabel("Last point (inclusive)").fill("101");
  await page.getByRole("button", { name: "Update preview" }).click();
  await expect(page.getByRole("alert")).toContainText("1 to 100");
  await page.getByLabel("First point (inclusive)").fill("22");
  await page.getByLabel("Last point (inclusive)").fill("121");
  await page.getByRole("button", { name: "Update preview" }).click();
  await expect(page.locator(".studio-screen #explorer")).toBeVisible();
  await expect(page.locator("[data-point]")).toHaveCount(100);
  await page.locator("#explorer").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#overview-text")).toContainText("partial data");
});

test("CSV file input preserves uploaded labels and zero/negative points", async ({
  page,
}) => {
  await page.getByRole("button", { name: /Creator Mode/ }).click();
  await page.locator("#file").setInputFiles({
    name: "values.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Category,Value\n原始标签,0\nNegative,-4\n"),
  });
  await page.getByLabel("No unit", { exact: true }).check();
  await page
    .getByRole("button", { name: "Validate mapping and continue" })
    .click();
  await expect(
    page.getByRole("button", { name: "原始标签, 0.00", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Negative, -4.00", exact: true }),
  ).toBeVisible();
});

test("native Web Audio creates and stops oscillators without runtime errors", async ({
  browser,
  baseURL,
}) => {
  // Separate context: use real audio APIs rather than beforeEach instrumentation.
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.nativeAudio = { starts: 0, stops: 0, frequencies: [] };
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) {
        super(...args);
        window.nativeContext = this;
      }
      createOscillator() {
        const oscillator = super.createOscillator();
        const start = oscillator.start.bind(oscillator);
        const stop = oscillator.stop.bind(oscillator);
        oscillator.start = (...args) => {
          nativeAudio.starts++;
          nativeAudio.frequencies.push(oscillator.frequency.value);
          return start(...args);
        };
        oscillator.stop = (...args) => {
          nativeAudio.stops++;
          return stop(...args);
        };
        return oscillator;
      }
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Creator Mode/ }).click();
  await uploadRainfall(page);
  await page.getByLabel("No unit", { exact: true }).check();
  await page
    .getByRole("button", { name: "Validate mapping and continue" })
    .click();
  await page.locator("#explorer").focus();
  await page.keyboard.press("r");
  await expect
    .poll(() => page.evaluate(() => nativeContext.state))
    .toBe("running");
  await page.getByRole("button", { name: "Play as music" }).click();
  await page.waitForTimeout(900);
  await page.keyboard.press("Escape");
  const result = await page.evaluate(() => nativeAudio);
  expect(result.starts).toBeGreaterThanOrEqual(1);
  expect(result.stops).toBeGreaterThanOrEqual(result.starts);
  expect(
    result.frequencies.every((n) => Number.isFinite(n) && n >= 220 && n <= 880),
  ).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
});

test("exactly 100 points opens Explorer without a range prompt", async ({
  page,
}) => {
  await page.getByRole("button", { name: /Creator Mode/ }).click();
  const csv = [
    "Category,Value",
    ...Array.from({ length: 100 }, (_, i) => `Point ${i + 1},${i}`),
  ].join("\n");
  await page.locator("#file").setInputFiles({
    name: "100-points.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByLabel("No unit", { exact: true }).check();
  await page
    .getByRole("button", { name: "Validate mapping and continue" })
    .click();
  await expect(page.locator("[data-point]")).toHaveCount(100);
  await expect(page.locator(".studio-screen #explorer")).toBeVisible();
  await expect(page.getByLabel("First point (inclusive)")).toHaveCount(0);
});

test("Mapping decimal places controls chart, extrema, selected point and speech", async ({
  page,
}) => {
  await page.getByRole("button", { name: /Creator Mode/ }).click();
  await page.locator("#file").setInputFiles({
    name: "precision.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Category,Value\nA,1.23456\nB,-0.00001\nC,0\n"),
  });
  await page.getByLabel("No unit", { exact: true }).check();
  await expect(page.locator("#decimalPlaces")).toHaveValue("2");
  await page.getByLabel("Decimal places").selectOption("3");
  await page
    .getByRole("button", { name: "Validate mapping and continue" })
    .click();
  await expect(page.locator(".overview-panel")).toContainText("1.235");
  await expect(page.locator(".overview-panel")).toContainText("0.000");
  await expect(
    page.getByRole("button", { name: "A, 1.235", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#selected-value")).toContainText("1.235");
  await page.locator("#explorer").focus();
  await page.keyboard.press("Enter");
  expect(
    await page.evaluate(
      () => audioEvents.filter((e) => typeof e === "object").at(-1).speech,
    ),
  ).toContain("A, 1.235");
  await page.getByRole("button", { name: "02 Map" }).click();
  await page.getByLabel("Decimal places").selectOption("0");
  await page
    .getByRole("button", { name: "Validate mapping and continue" })
    .click();
  await expect(
    page.getByRole("button", { name: "A, 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "02 Map" }).click();
  await page.getByLabel("Repeated categories").selectOption("count");
  await expect(page.locator("#decimalPlaces")).toBeDisabled();
  await expect(page.locator("#decimalPlaces")).toHaveValue("0");
  await page
    .getByRole("button", { name: "Validate mapping and continue" })
    .click();
  await expect(
    page.getByRole("button", { name: "A, 1 records", exact: true }),
  ).toBeVisible();
});
