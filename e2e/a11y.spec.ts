import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'
import { openApp } from './helpers'

const pages = ['/', '/timer', '/calendar', '/timesheet', '/reports', '/reports?tab=detailed', '/reports?tab=periodic', '/reports?tab=targets', '/projects', '/settings']

for (const scheme of ['light', 'dark'] as const) {
  test(`no serious accessibility issues (${scheme})`, async ({ page }) => {
    test.slow()
    await page.emulateMedia({ colorScheme: scheme })
    await openApp(page)
    const problems: string[] = []
    for (const path of pages) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
      for (const v of violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')) {
        problems.push(`${path} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')} (${v.nodes.length})`)
      }
    }
    expect(problems).toEqual([])
  })
}
