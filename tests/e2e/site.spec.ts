import { expect, test } from '@playwright/test';

test.describe('the website', () => {
  test('offers the Android download instead of the app', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Download for Android').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Continue with Google/i })).toHaveCount(0);
  });

  test('serves both privacy policy pages', async ({ page }) => {
    await page.goto('/privacy.html');
    await expect(page.getByRole('heading', { name: 'Xpences privacy policy' })).toBeVisible();
    await expect(page.getByText('Receipts', { exact: true }).first()).toBeVisible();
    await page.goto('/privacy-bn.html');
    await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
  });

  test('the app file version information is there for the update notice', async ({ request }) => {
    const res = await request.get('/download/version.json');
    expect(res.ok()).toBe(true);
    const info = await res.json();
    expect(typeof info.versionCode).toBe('number');
    expect(typeof info.versionName).toBe('string');
  });
});
