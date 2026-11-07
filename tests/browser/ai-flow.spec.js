import { test, expect } from '@playwright/test';

test('AI chooses music automatically and keeps adjustments optional', async ({ page }) => {
  let requestBody;
  await page.route('**/api/sound-map', async (route) => {
    requestBody = JSON.parse(route.request().postData());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mapping: 'contrast', style: 'jazz', reason: 'A relaxed pace suits this pattern.' }) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Creator Mode/ }).click();
  await page.getByRole('button', { name: /Or try a sample/ }).click();
  await page.getByLabel('No unit', { exact: true }).check();
  await page.getByRole('button', { name: 'Validate mapping and continue' }).click();
  await expect(page.locator('.ai-status')).toHaveText('AI chose Night jazz. Ready to play.');
  await expect(page.getByRole('button', { name: 'Play as music' })).toBeVisible();
  expect(requestBody.values).toEqual([95, 78, 65, 42, 28]);
  await expect(page.locator('#music-style')).toBeHidden();
  await page.getByText('Adjust music', { exact: true }).click();
  await expect(page.locator('#music-style')).toHaveValue('jazz');
  await expect(page.locator('#ai-mapping')).toHaveValue('contrast');
  await page.locator('#music-style').selectOption('folk');
  await expect(page.locator('.ai-status')).toHaveText('Your music choice is ready to play.');
  await expect(page.locator('#music-style')).toHaveValue('folk');
  await page.getByRole('button', { name: 'Use AI choice' }).click();
  await expect(page.locator('#music-style')).toHaveValue('jazz');
});
