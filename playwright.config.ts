import { defineConfig, devices } from '@playwright/test';

const remoteBase = process.env.E2E_BASE_URL;
if (process.env.WORKERS_CI && remoteBase) throw new Error('Native deployment checks must test the current local build.');
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: remoteBase || 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: remoteBase ? undefined : { command: 'npm run preview', url: 'http://127.0.0.1:4173/api/config', reuseExistingServer: !process.env.CI, timeout: 60000 },
});
