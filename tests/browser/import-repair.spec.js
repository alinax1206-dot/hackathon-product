import { test, expect } from "@playwright/test";

test("CSV with an empty header remains usable and explains the adjustment", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Creator Mode/ }).click();
  await page.locator("#file").setInputFiles({
    name: "avocado.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      ",Date,AveragePrice\n0,2015-12-27,1.33\n1,2015-12-20,1.35\n",
    ),
  });
  await expect(page.getByRole("status")).toContainText(
    "Column 1: blank header → “Column 1”",
  );
  await expect(page.getByLabel("Compare by")).toHaveValue("Date");
  await expect(page.getByLabel("Value to hear")).toHaveValue("AveragePrice");
  await page.getByLabel("No unit", { exact: true }).check();
  await page
    .getByRole("button", { name: "Validate mapping and continue" })
    .click();
  await expect(page.locator(".studio-screen #explorer")).toBeVisible();
});
