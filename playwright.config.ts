import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: [
    { command: 'npx vite --host 127.0.0.1 --port 4173 --strictPort', port: 4173, reuseExistingServer: !process.env.CI },
    { command: 'npx vite examples/vanilla --host 127.0.0.1 --port 4174 --strictPort', port: 4174, reuseExistingServer: !process.env.CI },
    { command: 'npm --prefix examples/vanilla run preview -- --host 127.0.0.1 --port 4175 --strictPort', port: 4175, reuseExistingServer: !process.env.CI },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
});
