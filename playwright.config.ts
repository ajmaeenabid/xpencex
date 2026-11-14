import { defineConfig, devices } from '@playwright/test';

// Browser tests ("click through the app"): `npm run test:e2e`. They cover the screens a signed-out person sees,
// in a phone-sized Chrome: the app opening to sign-in, the privacy policy, and the download website.
// Signed-in screens need a real Google sign-in and an approved device, so they are tested by hand.
// On a Windows PC, Playwright's small "winldd" helper only checks Chrome's needs and is easily cut off on a slow
// connection, so that check is skipped there. GitHub CI installs everything (--with-deps) and still runs it.
if (process.platform === 'win32' && !process.env.CI) process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS ??= '1';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  // channel 'chromium' runs the full Chromium without a window, so the separate "headless shell" download isn't needed
  use: { ...devices['Pixel 7'], locale: 'en-US', channel: 'chromium' },
  projects: [
    // The app itself, as `npm run dev` shows it (in a normal browser the built site only offers the download)
    { name: 'app', testMatch: /app\.spec\.ts/, use: { baseURL: 'http://localhost:3000' } },
    // The built website: the download page and the privacy policy
    { name: 'site', testMatch: /site\.spec\.ts/, use: { baseURL: 'http://localhost:4173' } },
  ],
  webServer: [
    { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI, timeout: 120_000 },
    { command: 'npm run build && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI, timeout: 180_000 },
  ],
});
