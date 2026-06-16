import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/admin.json' });

test('classrooms page lists classrooms', async ({ page }) => {
  await page.goto('/admin/classrooms');
  await expect(page.getByRole('heading', { name: /classroom/i })).toBeVisible({ timeout: 10000 });
});

test('cohorts page loads', async ({ page }) => {
  await page.goto('/admin/cohorts');
  await expect(page.getByRole('heading', { name: /cohort/i })).toBeVisible({ timeout: 10000 });
});

test('programs page loads', async ({ page }) => {
  await page.goto('/admin/programs');
  await expect(page.getByRole('heading', { name: /program/i })).toBeVisible({ timeout: 10000 });
});
