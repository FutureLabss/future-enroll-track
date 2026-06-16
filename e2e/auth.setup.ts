import { test as setup, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@futurelabs.ng';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'test-password';

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/admin/);
  await page.context().storageState({ path: 'e2e/.auth/admin.json' });
});
