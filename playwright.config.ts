import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1920, height: 1080 }, colorScheme: 'dark', trace: 'retain-on-failure' },
  workers: 1,
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173/api/health', reuseExistingServer: false, timeout: 60000 },
});
