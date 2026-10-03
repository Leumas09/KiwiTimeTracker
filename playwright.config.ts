import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run against the production build in demo mode
// (no Supabase variables), so every scenario starts from the sample data.
// With E2E_SUPABASE=1 they also run against a Supabase-like backend
// (scripts/integration-env.sh start must be running first).
const executablePath = process.env.PW_CHROMIUM_PATH
const withSupabase = !!process.env.E2E_SUPABASE

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4174',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } }, testIgnore: /(mobile|supabase)\.spec/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec/ },
    ...(withSupabase
      ? [{ name: 'supabase', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 }, baseURL: 'http://localhost:4175' }, testMatch: /supabase\.spec/ }]
      : []),
  ],
  webServer: [
    {
      command: 'npm run build && npx vite preview --port 4174 --strictPort',
      url: 'http://localhost:4174',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
    },
    ...(withSupabase
      ? [
          {
            command: 'node scripts/supabase-proxy.mjs',
            url: 'http://localhost:54331/health',
            reuseExistingServer: !process.env.CI,
          },
          {
            command: 'npx vite build --outDir dist-supabase && npx vite preview --outDir dist-supabase --port 4175 --strictPort',
            url: 'http://localhost:4175',
            reuseExistingServer: !process.env.CI,
            timeout: 180_000,
            env: { VITE_SUPABASE_URL: 'http://localhost:54331', VITE_SUPABASE_ANON_KEY: 'anon-key' },
          },
        ]
      : []),
  ],
})
