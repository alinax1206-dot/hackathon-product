import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function prepare(page) {
  await page.getByRole("button", { name: /Continue draft|Creator Mode/ }).click();
  await page.locator("#file").setInputFiles({
    name: "lesson.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("City,Rainfall\nSeattle,95\nPortland,78\nBoston,65"),
  });
  await page.getByLabel("Unit", { exact: true }).fill("mm");
  await page
    .getByRole("button", { name: "Validate mapping and continue" })
    .click();
  await page.getByLabel("Title (required)").fill("City lesson");
  await page.getByLabel("Learning goal").fill("Find the highest rainfall.");
}
async function publish(page) {
  await page.getByRole("button", { name: "Continue to publish" }).click();
  await page
    .getByRole("button", { name: "Publish learning material", exact: true })
    .click();
  await expect(page.locator(".class-code strong")).toHaveText(/^\d{6}$/);
  return page.locator(".class-code strong").textContent();
}
async function unlock(page, code) {
  await page.getByRole("button", { name: "Open User Mode" }).click();
  await expect(page.locator("#explorer")).toBeVisible();
}

test("draft preview, published revision, code and music style survive mode switches", async ({
  page,
}) => {
  await page.goto("/");
  await prepare(page);
  await page.getByRole("button", { name: "Preview as learner" }).click();
  await expect(page.locator(".learner-screen #explorer")).toBeVisible();
  await page.getByRole("button", { name: "03 Preview" }).click();
  await page.locator(".ai-settings > summary").click();
  await page.getByLabel("Music style").selectOption("jazz");
  const firstCode = await publish(page);
  const first = await page.evaluate(
    () => JSON.parse(localStorage.getItem("chartaloud.materials.v1"))[0],
  );
  expect(first.dataset.data.map((p) => p.value)).toEqual([95, 78, 65]);
  await unlock(page, firstCode);
  await expect(
    page.getByRole("heading", { name: "City lesson" }),
  ).toBeVisible();
  await expect(page.locator(".point-detail")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Play chart music" })).toHaveCount(0);
  await page.locator("#home").click();
  await page.getByRole("button", { name: /Continue draft|Creator Mode/ }).click();
  await page.getByRole("button", { name: "03 Preview" }).click();
  await page.getByLabel("Title (required)").fill("City lesson revised");
  await page.locator("#home").click();
  await page.getByRole("button", { name: /Continue draft|Creator Mode/ }).click();
  const secondCode = await publish(page);
  expect(secondCode).not.toBe(firstCode);
  const library = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("chartaloud.materials.v1")),
  );
  expect(library[0]).toEqual(first);
  expect(library[1].id).toBe(first.id);
  expect(library[1].revision).toBe(2);
});

test("bad code stays gated; valid code supports keyboard exploration", async ({
  page,
}) => {
  await page.goto("/");
  await prepare(page);
  const code = await publish(page);
  await page.getByRole("button", { name: "Open User Mode" }).click();
  await page.getByRole("button", { name: "01 Code" }).click();
  await page.getByLabel("Six-digit class code").fill("000000");
  await page.getByRole("button", { name: "Open another material" }).click();
  await expect(page.getByRole("alert")).toContainText("could not be found");
  await expect(page.locator("#explorer")).toHaveCount(0);
  await page.getByLabel("Six-digit class code").fill(code);
  await page.getByRole("button", { name: "Open another material" }).click();
  await page.locator("#explorer").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#selected-label")).toHaveText("Portland");
  await page.keyboard.press("End");
  await expect(page.locator("#selected-label")).toHaveText("Boston");
  await page.getByRole("button", { name: "01 Code" }).click();
  await expect(page.getByLabel("Six-digit class code")).toBeVisible();
});

test("published JSON exports; code is local to the publishing browser", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/");
  await prepare(page);
  const code = await publish(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export published JSON" }).click();
  const download = await downloadPromise;
  const material = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(material.title).toBe("City lesson");
  expect(material.revision).toBe(1);
  const context = await browser.newContext({ baseURL });
  try {
    const learner = await context.newPage();
    await learner.goto("/");
    await learner.getByRole("button", { name: /User Mode/ }).click();
    await learner.getByLabel("Six-digit class code").fill(code);
    await learner
      .getByRole("button", { name: "Open another material" })
      .click();
    await expect(learner.getByRole("alert")).toContainText(
      "could not be found",
    );
  } finally {
    await context.close();
  }
});

test("storage failure keeps draft and does not display a code", async ({
  page,
}) => {
  await page.goto("/");
  await prepare(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Full", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "Continue to publish" }).click();
  await page
    .getByRole("button", { name: "Publish learning material", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("blocked or full");
  await expect(page.locator(".class-code")).toHaveCount(0);
  await page.getByRole("button", { name: "03 Preview" }).click();
  await expect(page.getByLabel("Title (required)")).toHaveValue("City lesson");
});

test("published lesson opens directly, waits for a question, and remains recent", async ({ page }) => {
  await page.addInitScript(() => {
    window.spokenOnOpen = [];
    window.speechSynthesis.speak = (utterance) => window.spokenOnOpen.push(utterance.text);
  });
  await page.goto("/");
  await prepare(page);
  const code = await publish(page);
  await page.getByRole("button", { name: "Open User Mode" }).click();
  await expect(page.locator(".learner-screen #explorer")).toBeVisible();
  await expect(page.locator(".point-detail")).toHaveCount(0);
  expect(await page.evaluate(() => window.spokenOnOpen)).toEqual([
    "Hi! Welcome to ChartAloud. Would you like Creator Mode or User Mode?",
    "Hi! I'm here whenever you're ready. What would you like to explore?",
  ]);
  await page.getByRole("button", { name: "01 Code" }).click();
  await expect(page.locator(".recent-material")).toContainText(code);
  await page.reload();
  await page.getByRole("button", { name: /User Mode/ }).click();
  await expect(page.locator(".recent-material")).toContainText(code);
  await page.getByRole("button", { name: "Continue learning" }).click();
  await expect(page.locator(".learner-screen #explorer")).toBeVisible();
});

test("archive lists multiple saved materials and reopens an older revision", async ({ page }) => {
  await page.goto("/");
  await prepare(page);
  const firstCode = await publish(page);
  await page.getByRole("button", { name: "Start another material" }).click();
  await page.locator("#file").setInputFiles({
    name: "second.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Place,Score\nA,8\nB,12"),
  });
  await page.getByLabel("No unit", { exact: true }).check();
  await page.getByRole("button", { name: "Validate mapping and continue" }).click();
  await page.getByLabel("Title (required)").fill("Second lesson");
  const secondCode = await publish(page);
  await page.getByRole("button", { name: "Material Archive" }).click();
  await expect(page.locator(".archive-card")).toHaveCount(2);
  await expect(page.locator(".archive-screen")).toContainText(firstCode);
  await expect(page.locator(".archive-screen")).toContainText(secondCode);
  await page.locator(".archive-card", { hasText: "City lesson" }).getByRole("button", { name: "Review in Creator" }).click();
  await expect(page.getByLabel("Title (required)")).toHaveValue("City lesson");
  await page.getByRole("button", { name: "Material Archive" }).click();
  await page.locator(".archive-card", { hasText: "City lesson" }).getByRole("button", { name: "Open as learner" }).click();
  await expect(page.getByRole("heading", { name: "City lesson" })).toBeVisible();
  await expect(page.locator(".learner-screen #explorer")).toBeVisible();
});

test("uploading another table keeps the earlier draft available in Archive", async ({ page }) => {
  await page.goto("/");
  await prepare(page);
  await page.getByRole("button", { name: "01 Import" }).click();
  await page.locator("#file").setInputFiles({
    name: "new.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Place,Score\nA,8\nB,12"),
  });
  await page.getByRole("button", { name: "Material Archive" }).click();
  await expect(page.locator(".draft-card")).toHaveCount(2);
  await page.locator(".draft-card", { hasText: "City lesson" }).getByRole("button", { name: "Resume draft" }).click();
  await page.getByRole("button", { name: "03 Preview" }).click();
  await expect(page.getByLabel("Title (required)")).toHaveValue("City lesson");
  await expect(page.locator("#explorer")).toBeVisible();
});

test("home and User Mode offer short English voice greetings", async ({ page }) => {
  await page.addInitScript(() => {
    window.greetings = [];
    window.speechSynthesis.speak = (utterance) => window.greetings.push({ text: utterance.text, lang: utterance.lang });
  });
  await page.goto("/");
  await expect(page.locator("#assistant-messages")).toContainText("Creator Mode or User Mode");
  await page.getByRole("button", { name: /User Mode/ }).click();
  await expect(page.locator("#assistant-messages")).toContainText("Enter a class code");
  const greetings = await page.evaluate(() => window.greetings);
  expect(greetings).toHaveLength(2);
  expect(greetings.every((item) => item.lang.toLowerCase().startsWith("en"))).toBe(true);
  expect(greetings.every((item) => item.text.length < 100)).toBe(true);
});
