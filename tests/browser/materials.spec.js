import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { SAMPLE_MATERIAL } from "../../src/materials.js";
const key = "chartaloud.materials.v1";
async function prepare(page) {
  await page.getByRole("button", { name: /Creator Mode/ }).click();
  await page.locator("#file").setInputFiles({
    name: "lesson.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("City,Rainfall\n原始标签,0\nB,-4\nC,12.3456"),
  });
  await page.getByLabel("Unit", { exact: true }).fill("mm");
  await page
    .getByRole("button", { name: "Validate mapping and continue" })
    .click();
  await page.getByLabel("Title (required)").fill("City lesson");
  await page.getByLabel("Short description").fill("Compare three places.");
  await page.getByLabel("Learning goal").fill("Find the highest rainfall.");
}
async function publish(page) {
  await page.getByRole("button", { name: "Review and publish" }).click();
  await page
    .getByRole("button", { name: "Publish learning material", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Published revision" }),
  ).toBeVisible();
}
async function openSample(page) {
  await page.getByRole("button", { name: /User Mode/ }).click();
  await page.getByRole("button", { name: /Open Sample/ }).click();
}
async function instrument(page) {
  await page.addInitScript(() => {
    window.events = [];
    window.speechSynthesis.cancel = () => events.push("cancel");
    window.speechSynthesis.speak = (u) =>
      events.push({ text: u.text, lang: u.lang });
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      createOscillator() {
        const n = super.createOscillator();
        const start = n.start.bind(n);
        n.start = (...args) => {
          events.push("note");
          return start(...args);
        };
        return n;
      }
    };
  });
}
test("Creator publication, immutable revisions, learner preview and exact User handoff", async ({
  page,
}) => {
  await page.goto("/");
  await prepare(page);
  const dataset = await page.evaluate(() =>
    window.chartaloudContext.getCurrent(),
  );
  expect(dataset.statistics.count).toBe(3);
  await page.getByRole("button", { name: "Preview as learner" }).click();
  await expect(
    page.getByText("Preview as learner · Unpublished draft"),
  ).toBeVisible();
  await expect(page.getByLabel("Title (required)")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to preview" }).click();
  await publish(page);
  const first = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k))[0],
    key,
  );
  expect(first.dataset.data.map((p) => p.value)).toEqual([0, -4, 12.3456]);
  await page.getByRole("button", { name: "Preview as learner" }).click();
  await expect(page.locator("#explorer")).toBeVisible();
  await page.getByRole("button", { name: "Back to preview" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Publish learning material",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to preview" }).click();
  await page.getByLabel("Title (required)").fill("Revised lesson");
  await page.getByRole("button", { name: "Back to home" }).click();
  await expect(page.getByText(/You have unpublished changes/)).toBeVisible();
  await page.getByRole("button", { name: /User Mode/ }).click();
  await expect(
    page.getByRole("heading", { name: "Learning materials" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open City lesson revision 1" })
    .click();
  const loaded = await page.evaluate(
    () => chartaloudContext.getCurrent().material,
  );
  expect(loaded).toEqual(first);
  await expect(page.locator("h1")).toBeFocused();
  await page.getByRole("button", { name: "Back to home" }).click();
  await page.getByRole("button", { name: /Creator Mode/ }).click();
  await expect(page.getByLabel("Title (required)")).toHaveValue(
    "Revised lesson",
  );
  await publish(page);
  const list = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)),
    key,
  );
  expect(list[0]).toEqual(first);
  expect(list[1].id).toBe(first.id);
  expect(list[1].revision).toBe(2);
  expect(list[1].dataset).toEqual(first.dataset);
  await page.getByRole("button", { name: "Start another material" }).click();
  await page.getByRole("button", { name: /Or try a sample/ }).click();
  await page.getByLabel("No unit", { exact: true }).check();
  await page
    .getByRole("button", { name: "Validate mapping and continue" })
    .click();
  await publish(page);
  const latest = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)).at(-1),
    key,
  );
  expect(latest.id).not.toBe(first.id);
  expect(latest.revision).toBe(1);
});
test("JSON export/import across clean browser context, bad JSON, schema and conflicts", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/");
  await prepare(page);
  await publish(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export published JSON" }).click();
  const download = await downloadPromise;
  const source = await readFile(await download.path(), "utf8");
  const context = await browser.newContext({ baseURL });
  const learner = await context.newPage();
  await learner.goto("/");
  await learner.getByRole("button", { name: /User Mode/ }).click();
  await learner.getByLabel("Import learning material JSON").setInputFiles({
    name: "lesson.json",
    mimeType: "application/json",
    buffer: Buffer.from(source),
  });
  await expect(learner.locator("#explorer")).toBeVisible();
  expect(
    await learner.evaluate(() => chartaloudContext.getCurrent().material),
  ).toEqual(JSON.parse(source));
  await learner.getByRole("button", { name: "Back to materials" }).click();
  for (const [source, pattern] of [
    ["bad", "damaged"],
    [
      JSON.stringify({ ...SAMPLE_MATERIAL, schemaVersion: 99 }),
      "unsupported schema",
    ],
  ]) {
    await learner.getByLabel("Import learning material JSON").setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from(source),
    });
    await expect(learner.getByRole("alert")).toContainText(pattern);
  }
  const conflict = JSON.parse(source);
  conflict.title = "conflicting title";
  await learner.getByLabel("Import learning material JSON").setInputFiles({
    name: "conflict.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(conflict)),
  });
  await expect(learner.getByRole("alert")).toContainText("different content");
  const list = await learner.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)),
    key,
  );
  expect(list[0]).toEqual(JSON.parse(source));
  await context.close();
});
test("empty library has Sample; keyboard operations and speech are explicitly requested only", async ({
  page,
}) => {
  await instrument(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /guidance/i })).toHaveCount(0);
  await expect(page.getByText("Audio guidance · Coming soon")).toBeVisible();
  await expect(page.getByText(/Press Space/)).toHaveCount(0);
  await page.locator("h1").focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: /User Mode/ })).toBeVisible();
  await page.getByRole("button", { name: /User Mode/ }).focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByText("No saved materials yet.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Open Sample/ }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Show overview" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#overview-text")).toBeFocused();
  expect(
    await page.evaluate(() => events.filter((e) => typeof e === "object")),
  ).toEqual([]);
  await page.getByRole("button", { name: "Focus exploration area" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#selected-label")).toHaveText("Portland");
  await page.keyboard.press("End");
  await expect(page.locator("#selected-label")).toHaveText("Denver");
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  expect(
    await page.evaluate(() =>
      events.filter((e) => typeof e === "object").at(-1),
    ),
  ).toEqual({ text: "Seattle, 95.00 mm.", lang: "en-US" });
  await page.keyboard.press("r");
  await expect
    .poll(() => page.evaluate(() => events.filter((e) => e === "note").length))
    .toBe(1);
  await page.keyboard.press("Space");
  await expect(page.locator("#player-status")).toHaveText(
    "Playing data sequence.",
  );
  await page.waitForTimeout(850);
  await expect(page.locator("#explorer")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.locator("#player-status")).toHaveText("Sequence paused.");
  const notes = await page.evaluate(
    () => events.filter((e) => e === "note").length,
  );
  await page.waitForTimeout(900);
  expect(
    await page.evaluate(() => events.filter((e) => e === "note").length),
  ).toBe(notes);
  await page.keyboard.press("Space");
  await page.keyboard.press("Escape");
  await expect(page.locator("#player-status")).toHaveText("Ready to play.");
  await page.getByLabel("Enable R shortcut").uncheck();
  await page.locator("#explorer").focus();
  await page.keyboard.press("r");
  await expect(page.locator("#player-status")).toHaveText("Ready to play.");
  // Native controls keep their normal Space/letter behavior.
  await page.keyboard.press("Home");
  await page.getByRole("button", { name: "Next point" }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#selected-label")).toHaveText("Portland");
  const noteCount = await page.evaluate(
    () => events.filter((e) => e === "note").length,
  );
  await page.keyboard.press("r");
  await page.keyboard.press("Control+ArrowRight");
  expect(
    await page.evaluate(() => events.filter((e) => e === "note").length),
  ).toBe(noteCount);
  await page.getByRole("button", { name: "Back to materials" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Learning materials" }),
  ).toBeFocused();
});
test("switching contexts cancels sequence, exact speech and async recorded music", async ({
  page,
}) => {
  await instrument(page);
  await page.goto("/");
  await openSample(page);
  await page.getByRole("button", { name: "Play data", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => events.filter((e) => e === "note").length))
    .toBe(1);
  await page.getByRole("button", { name: "Back to materials" }).click();
  const count = await page.evaluate(
    () => events.filter((e) => e === "note").length,
  );
  await page.waitForTimeout(1000);
  expect(
    await page.evaluate(() => events.filter((e) => e === "note").length),
  ).toBe(count);
  await page.getByRole("button", { name: /Open Sample/ }).click();
  await page.getByRole("button", { name: "Read exact value" }).click();
  await page.getByRole("button", { name: "Next point" }).click();
  expect(await page.evaluate(() => events.at(-1))).toBe("cancel");
  await page.getByRole("button", { name: /Play as music/ }).click();
  await page.getByRole("button", { name: "Back to home" }).click();
  await page.waitForTimeout(1000);
  await expect(
    page.getByRole("button", { name: /Creator Mode/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => events.filter((e) => e === "note").length),
  ).toBe(count);
});
test("failed save preserves draft, no success; corrupted library and session-only import recover", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Full", "QuotaExceededError");
    };
  });
  await page.goto("/");
  await prepare(page);
  await page.getByRole("button", { name: "Review and publish" }).click();
  await page
    .getByRole("button", { name: "Publish learning material", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("blocked or full");
  await expect(page.getByText(/Published revision/)).toHaveCount(0);
  await page.getByRole("button", { name: "Back to preview" }).click();
  await expect(page.getByLabel("Title (required)")).toHaveValue("City lesson");
  await page.getByRole("button", { name: "Back to home" }).click();
  await page.getByRole("button", { name: /User Mode/ }).click();
  await page.getByLabel("Import learning material JSON").setInputFiles({
    name: "valid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(SAMPLE_MATERIAL)),
  });
  await expect(page.locator("#explorer")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("this session only");
});
test("corrupt library does not block Sample or overwrite storage", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate((k) => localStorage.setItem(k, "broken"), key);
  await page.getByRole("button", { name: /User Mode/ }).click();
  await expect(page.getByRole("alert")).toContainText("could not be read");
  await page.getByRole("button", { name: /Open Sample/ }).click();
  await expect(page.locator("#explorer")).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(
    "broken",
  );
});
test("save review screenshots", async ({ page }) => {
  await mkdir("artifacts/screenshots", { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.screenshot({
    path: "artifacts/screenshots/home.png",
    fullPage: true,
  });
  await prepare(page);
  await page.screenshot({
    path: "artifacts/screenshots/creator-preview.png",
    fullPage: true,
  });
  await publish(page);
  await page.screenshot({
    path: "artifacts/screenshots/creator-publish.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open User Mode" }).click();
  await page
    .getByRole("button", { name: "Open City lesson revision 1" })
    .click();
  await page.screenshot({
    path: "artifacts/screenshots/user-explorer.png",
    fullPage: true,
  });
});

test("required title blocks publication without discarding preview", async ({
  page,
}) => {
  await page.goto("/");
  await prepare(page);
  await page.getByLabel("Title (required)").fill("   ");
  await page.getByRole("button", { name: "Review and publish" }).click();
  await expect(page.getByRole("alert")).toContainText("Enter a title");
  await expect(page.getByLabel("Title (required)")).toBeFocused();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  await expect(page.locator("[data-point]")).toHaveCount(3);
});

test("separate pause control and play/replay control preserve progress and focus", async ({
  page,
}) => {
  await page.goto("/");
  await openSample(page);
  const button = page.locator("#play"),
    pause = page.locator("#pause-music");
  await expect(button).toHaveText("Play data");
  await expect(pause).toBeDisabled();
  await button.click();
  await expect(button).toHaveText("Replay data");
  await expect(pause).toBeEnabled();
  await page.waitForTimeout(850);
  await pause.click();
  await expect(pause).toHaveText("Resume");
  const selected = await page.locator("#selected-label").textContent();
  await page.waitForTimeout(900);
  await expect(page.locator("#selected-label")).toHaveText(selected);
  await expect(pause).toBeFocused();
  await pause.click();
  await expect(pause).toHaveText("Pause");
  await expect(pause).toBeDisabled({ timeout: 7000 });
  await expect(button).toHaveText("Replay data");
  await button.click();
  await expect(page.locator("#selected-label")).toHaveText("Seattle");
  await expect(button).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(pause).toBeDisabled();
  await expect(button).toHaveText("Replay data");
});
