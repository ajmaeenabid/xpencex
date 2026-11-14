import { expect, test } from '@playwright/test';

test.describe('the app, signed out', () => {
  test('opens with the animation, then shows sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Welcome to Xpences')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
  });

  test('opens the privacy policy inside the app and closes it again', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Privacy policy' }).click({ timeout: 15_000 });
    const policy = page.frameLocator('iframe[title="Privacy policy"]');
    await expect(policy.getByRole('heading', { name: 'Xpences privacy policy' })).toBeVisible();
    // The Bangla link stays inside the window
    await policy.getByRole('link', { name: 'বাংলায় পড়ুন' }).click();
    await expect(policy.getByRole('heading', { level: 1 })).toContainText('Xpences');
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('iframe[title="Privacy policy"]')).toHaveCount(0);
  });
});
