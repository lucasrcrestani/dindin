import { defineConfig } from '@playwright/test';

const nodeCommand = `"${process.execPath}"`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3001',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: `${nodeCommand} node_modules/serve/build/main.js . -l 3001 --no-clipboard`,
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
