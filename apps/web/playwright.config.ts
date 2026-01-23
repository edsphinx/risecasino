import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for VyreCasino E2E Tests
 *
 * Run with: pnpm e2e
 * Debug with: pnpm e2e:debug
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    // Base URL for the local dev server
    baseURL: 'https://localhost:5173',

    // Ignore HTTPS errors for local dev with mkcert
    ignoreHTTPSErrors: true,

    // Capture trace on failure for debugging
    trace: 'on-first-retry',

    // Take screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Uncomment for cross-browser testing
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // Start dev server before tests
  webServer: {
    command: 'pnpm dev',
    url: 'https://localhost:5173',
    reuseExistingServer: !process.env.CI,
    ignoreHTTPSErrors: true,
    timeout: 120000,
  },
});
