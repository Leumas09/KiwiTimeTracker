import { defineConfig } from 'vitest/config'

// Needs the environment from scripts/integration-env.sh.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
  },
})
