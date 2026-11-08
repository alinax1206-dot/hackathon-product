import { test, expect } from "@playwright/test";

test("bundled Kokoro voice synthesizes locally without remote model requests", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const assetResponses = [];
  const externalRequests = [];
  const pageErrors = [];
  page.on("response", (response) => {
    if (
      /\/models\/kokoro\/|\/voices\/af_heart\.bin$|\/wasm\/ort-wasm-simd-threaded\./.test(
        response.url(),
      )
    )
      assetResponses.push({ url: response.url(), status: response.status() });
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("https://huggingface.co/**", (route) => {
    externalRequests.push(route.request().url());
    return route.abort();
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Creator Mode/ }).click();
  await page.locator("#file").setInputFiles({
    name: "voice-test.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Category,Value\nA,5\nB,9"),
  });
  await page.getByLabel("No unit", { exact: true }).check();
  await page
    .getByRole("button", { name: "Validate mapping and continue" })
    .click();
  await page.getByRole("button", { name: "Preview as learner" }).click();
  await expect(page.locator(".learner-screen #explorer")).toBeVisible();
  await expect(
    page.getByRole("note", { name: "Keyboard shortcuts" }),
  ).toBeVisible();
  await expect(
    page.getByRole("note", { name: "Keyboard shortcuts" }),
  ).toContainText("Enter");
  await expect(page.locator("#player-status")).toContainText(
    /Preparing|Downloading/,
  );
  await expect(page.locator(".voice-assistant")).toHaveClass(/is-thinking/);
  await expect(page.locator("#player-status")).toHaveText(
    "Local English voice ready.",
    { timeout: 120_000 },
  );
  await expect(page.locator(".assistant-launcher-status")).toContainText(
    "Ready",
  );
  await page.locator("#explorer").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.locator("[data-point]").first()).toBeFocused();
  await expect(page.locator("#player-status")).toHaveText(
    "Reading exact value.",
    { timeout: 120_000 },
  );
  await expect(page.locator("#player-status")).toHaveText("Ready to play.", {
    timeout: 120_000,
  });
  expect(assetResponses).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        url: expect.stringContaining(
          "/models/kokoro/onnx/model_quantized.onnx",
        ),
        status: 200,
      }),
      expect.objectContaining({
        url: expect.stringContaining("/voices/af_heart.bin"),
        status: 200,
      }),
      expect.objectContaining({
        url: expect.stringContaining("/wasm/ort-wasm-simd-threaded.wasm"),
        status: 200,
      }),
    ]),
  );
  expect(externalRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});
