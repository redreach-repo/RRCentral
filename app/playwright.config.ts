import { defineConfig, devices } from '@playwright/test'

/**
 * Accessibility checks (axe) for HighMast in light and dark mode.
 * Runs against the built app in local mode (no Supabase, data stays in the
 * test browser), so it never touches real data. Build first: npm run build.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173/RRCentral/',
    trace: 'off',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/RRCentral/login',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
