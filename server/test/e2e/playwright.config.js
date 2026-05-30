import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 10000,
    ignoreHTTPSErrors: true,
  },

  webServer: [
    {
      command: 'cd .. && npm start',
      port: 3000,
      timeout: 10000,
      reuseExistingServer: true,
    },
    {
      command: 'cd ../../client && npx vite --port 5173 --strictPort',
      port: 5173,
      timeout: 15000,
      reuseExistingServer: true,
    },
  ],

  globalSetup: './global.setup.js',
});
