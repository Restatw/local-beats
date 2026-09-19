import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env['BASE_URL'] ?? 'http://localhost:8080';

export default defineConfig({
  testDir: './tests',
  outputDir: './out/results',
  workers: 1,
  timeout: 90_000,
  reporter: [['list']],
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
});
