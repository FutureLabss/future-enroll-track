# Integrate Playwright for E2E Testing

## Step 1: Install

```bash
npm install -D @playwright/test
npx playwright install chromium
```

## Step 2: Config

Create `playwright.config.ts` at project root:

```ts
import { defineConfig, devices } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

## Step 3: Test structure

Create `e2e/` directory with these files:

**`e2e/auth.setup.ts`** — Supabase auth helper:
```ts
import { test as setup, expect } from '@playwright/test';

const ADMIN_EMAIL = 'admin@futurelabs.ng';
const ADMIN_PASSWORD = 'test-password';

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin/**');
  await page.context().storageState({ path: 'e2e/.auth/admin.json' });
});
```

**`e2e/login.spec.ts`**:
```ts
import { test, expect } from '@playwright/test';

test('login page renders', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
});

test('shows error on invalid credentials', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', 'wrong@email.com');
  await page.fill('input[name="password"]', 'wrongpassword');
  await page.click('button[type="submit"]');
  await expect(page.getByText(/invalid|error|failed/i)).toBeVisible({ timeout: 10000 });
});
```

**`e2e/dashboard.spec.ts`** (uses admin auth):
```ts
import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/admin.json' });

test('admin dashboard loads stats', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByText(/total enrollment|revenue|program/i)).toBeVisible({ timeout: 10000 });
});

test('enrollments page has table', async ({ page }) => {
  await page.goto('/admin/enrollments');
  await expect(page.getByRole('table')).toBeVisible({ timeout: 10000 });
});
```

**`e2e/classroom.spec.ts`**:
```ts
import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/admin.json' });

test('classroom schedule tab loads', async ({ page }) => {
  await page.goto('/admin/classrooms');
  await page.locator('a').filter({ hasText: /classroom name/i }).first().click();
  await page.getByRole('tab', { name: /schedule/i }).click();
  await expect(page.getByText(/no sessions|scheduled/i)).toBeVisible({ timeout: 10000 });
});

test('attendance session can be started', async ({ page }) => {
  await page.goto('/admin/classrooms');
  await page.locator('a').filter({ hasText: /classroom name/i }).first().click();
  await page.getByRole('tab', { name: /attendance/i }).click();
  await page.getByRole('button', { name: /start session/i }).click();
  await expect(page.getByText(/duration|code/i)).toBeVisible({ timeout: 5000 });
});
```

## Step 4: Add npm script

In `package.json`:

```json
"scripts": {
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test:e2e:debug": "playwright test --debug"
}
```

## Step 5: `.gitignore` entries

Add to `.gitignore`:
```
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/
e2e/.auth/
```
