import { uploadRainfall } from "./upload-helper.js";
import { test, expect } from "@playwright/test";
test("publish-only code step and code-gated learning", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".hero h1")).toHaveText("Data Shouldn't Have to Be Seen to Be Understood.");
  await expect(page.locator(".demo-accounts")).toHaveCount(0);
  await expect(page.locator(".account-bar")).toHaveCount(0);
  await page.getByRole("button", { name: /Creator Mode/ }).click();
  await expect(
    page.getByRole("heading", { name: "What shall we explore today?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Creator progress" }),
  ).toContainText("05Code");
  await expect(page.locator(".class-code")).toHaveCount(0);
  await uploadRainfall(page);
  await page.getByLabel("No unit", { exact: true }).check();
  await page
    .getByRole("button", { name: "Validate mapping and continue" })
    .click();
  await page
    .getByRole("button", { name: "Continue to publish", exact: true })
    .click();
  await expect(page.locator(".class-code")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("chartaloud.classroom.v1")),
  ).toBeNull();
  await page
    .getByRole("button", { name: "Publish learning material", exact: true })
    .click();
  await expect(page.locator('nav li[aria-current="step"]')).toHaveText(
    "05Code",
  );
  const code = await page.locator(".class-code strong").textContent();
  expect(code).toMatch(/^\d{6}$/);
  await page
    .getByRole("button", { name: "Open User Mode", exact: true })
    .click();
  await expect(page.locator("#explorer")).toBeVisible();
  await expect(page.locator(".class-code")).toHaveCount(0);
  await page.getByRole("button", { name: "01 Code" }).click();
  await page.getByLabel("Six-digit class code").fill("000000");
  await page.getByRole("button", { name: "Open another material" }).click();
  await expect(page.getByRole("alert")).toContainText("could not be found");
  await page.getByLabel("Six-digit class code").fill(code);
  await page.getByLabel("Six-digit class code").press("Enter");
  await expect(page.locator("#explorer")).toBeVisible();
  await page.locator("#home").click();
  await expect(page.locator(".account-bar")).toHaveCount(0);
  await page.getByRole("button", { name: /Creator Mode/ }).click();
  await expect(page.locator(".class-code strong")).toHaveText(code);
  await page
    .getByRole("button", { name: "Start another material", exact: true })
    .click();
  await expect(page.locator(".class-code")).toHaveCount(0);
});
