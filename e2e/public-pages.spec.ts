import { test, expect } from '@playwright/test';

test('enrollment page renders', async ({ page }) => {
  await page.goto('/enroll');
  await expect(page.getByRole('heading', { name: /enroll/i })).toBeVisible({ timeout: 10000 });
});

test('demo page renders', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByText(/demo|futurelabs/i).first()).toBeVisible({ timeout: 10000 });
});

test('not-found page shows 404', async ({ page }) => {
  await page.goto('/nonexistent-route');
  await expect(page.getByText(/404|not found/i)).toBeVisible({ timeout: 10000 });
});
