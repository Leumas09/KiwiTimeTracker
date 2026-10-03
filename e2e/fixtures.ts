import { expect, test as base } from '@playwright/test'

// Ignored: realtime websockets are not emulated in the Supabase E2E setup.
const IGNORED = [/WebSocket/i, /realtime/i, /ERR_FAILED/]

/** Fails any test that logs a console error or throws in the page. */
export const test = base.extend<{ pageErrors: void }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
      page.on('console', (m) => {
        if (m.type() === 'error' && !IGNORED.some((r) => r.test(m.text()))) errors.push(`console: ${m.text()}`)
      })
      await use()
      expect(errors, 'errors in the page').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
