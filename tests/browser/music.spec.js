import { test, expect } from "@playwright/test";

test("single-series music plays recorded instruments and can be stopped", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Creator Mode/ }).click();
  await page.getByRole("button", { name: /Or try a sample/ }).click();
  await page.getByLabel("No unit", { exact: true }).check();
  await page
    .getByRole("button", { name: "Validate mapping and continue" })
    .click();
  await page.getByRole("button", { name: /Play as music/ }).click();
  await expect(page.locator("#player-status")).toContainText(
    "Playing your data as music",
    { timeout: 15000 },
  );
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#player-status")).toContainText("Ready to play");
});

test("upload and music screens fit a narrow phone viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /Creator Mode/ }).click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: /Or try a sample/ }).click();
  await page.getByLabel("No unit", { exact: true }).check();
  await page
    .getByRole("button", { name: "Validate mapping and continue" })
    .click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("drop zone imports a CSV file", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Creator Mode/ }).click();
  await page.locator(".upload-paper").evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(["City,Value\nA,12\nB,18"], "dropped.csv", { type: "text/csv" }),
    );
    element.dispatchEvent(
      new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
    );
  });
  await expect(
    page.getByRole("heading", { name: "Map your data" }),
  ).toBeVisible();
  await expect(page.getByText("dropped.csv")).toBeVisible();
});

test("mode screens remain usable without horizontal page scrolling", async ({
  page,
}) => {
  for (const [width, height] of [
    [1440, 900],
    [1366, 768],
    [1024, 768],
    [768, 1024],
    [390, 844],
    [390, 667],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const fits = async () => {
      const size = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      }));
      expect(size.width).toBeLessThanOrEqual(width);
    };
    await fits();
    await page.getByRole("button", { name: /Creator Mode/ }).click();
    const menuLabelsFit = await page.evaluate(() =>
      [...document.querySelectorAll("nav li span:last-child")].every(
        (label) =>
          label.getBoundingClientRect().right <=
          label.parentElement.getBoundingClientRect().right + 1,
      ),
    );
    expect(menuLabelsFit).toBe(true);
    const note = page.locator(".sticky-note");
    if (await note.isVisible()) {
      const logoRatio = await note
        .locator("img")
        .evaluate(
          (img) =>
            img.offsetWidth /
            img.offsetHeight /
            (img.naturalWidth / img.naturalHeight),
        );
      expect(logoRatio).toBeGreaterThan(0.98);
      expect(logoRatio).toBeLessThan(1.02);
      const noteBox = await note.boundingBox();
      const actionBox = await page
        .locator(".upload-action .button")
        .boundingBox();
      expect(
        noteBox.bottom <= actionBox.y ||
          noteBox.x >= actionBox.x + actionBox.width,
      ).toBe(true);
    }
    const withinViewport = async (selector) => {
      const box = await page.locator(selector).first().boundingBox();
      expect(box).not.toBeNull();
      await page.locator(selector).first().scrollIntoViewIfNeeded();
      await expect(page.locator(selector).first()).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    };
    await withinViewport("#sample");
    await fits();
    await page.getByRole("button", { name: /Or try a sample/ }).click();
    await withinViewport("#explore");
    await fits();
    await page.getByLabel("No unit", { exact: true }).check();
    await page
      .getByRole("button", { name: "Validate mapping and continue" })
      .click();
    await withinViewport("#play");
    await withinViewport(".point-detail");
    await fits();
  }
});
