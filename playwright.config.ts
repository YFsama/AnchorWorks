import { defineConfig, devices } from '@playwright/test';

// Playwright smoke-test layer for Anchorworks.
// Runs a single Chromium project against the production preview server
// (`vite preview`) to keep the surface area small. Vitest (the unit-test
// runner) still owns deep coverage of pure lib code; these e2e checks only
// guard end-to-end regressions like "splash never hides" or "palette won't
// open".
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: 1,
  // The preview server is a long-lived process; reuse it locally so iterating
  // on a single test doesn't pay the build + boot cost each run. CI always
  // builds from scratch.
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
