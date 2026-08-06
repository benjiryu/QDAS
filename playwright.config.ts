import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end and accessibility smoke tests.
 *
 * Runs against a production preview build rather than the dev server, so the
 * development announcement log is absent and what is tested is what a
 * participant session would run.
 *
 * Chromium only for now. Per D-024 the real screen reader check is manual in
 * VoiceOver, and these tests assert structure a browser can verify rather than
 * pretending to stand in for that.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'html' : 'list',

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
