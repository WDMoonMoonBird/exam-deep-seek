import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: 'https://deadpan.asia',
    headless: true,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 10000,
    ignoreHTTPSErrors: true,
  },
});
