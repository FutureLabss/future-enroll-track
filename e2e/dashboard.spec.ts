import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/admin.json' });

test('admin dashboard loads stats', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByText(/total enrollment|revenue|program/i)).toBeVisible({ timeout: 10000 });
});

test('enrollments page has table', async ({ page }) => {
  await page.goto('/admin/enrollments');
  await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
});

test('invoices page loads', async ({ page }) => {
  await page.goto('/admin/invoices');
  await expect(page.getByRole('heading', { name: /invoice/i })).toBeVisible({ timeout: 10000 });
});

test('payments page loads', async ({ page }) => {
  await page.goto('/admin/payments');
  await expect(page.getByRole('heading', { name: /payment/i })).toBeVisible({ timeout: 10000 });
});
