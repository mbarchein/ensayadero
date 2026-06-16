import { defineConfig } from '@playwright/test'

// The local stack (docker-compose.yml) must be up: app on :5173, API on :54321.
// Locale is pinned to es-ES so the assertions can check the Spanish wording.
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.APP_URL ?? 'http://localhost:5173',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'e2e',
      testMatch: /\.spec\.ts$/,
      dependencies: ['setup'],
      use: { storageState: '.auth/admin.json' },
    },
  ],
})
