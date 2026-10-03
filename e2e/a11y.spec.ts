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

test('quick entry window and calendar menu are accessible', async ({ page }) => {
  await openApp(page, 'Pro', '/calendar')
  await page.locator('.fc-prev-button').click()
  await page.locator('.fc-day-mon .fc-event').first().click()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('listbox')).toBeVisible()
  const check = async () => {
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)
  }
  expect(await check()).toEqual([])
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.locator('.fc-day-tue .fc-event').first().click({ button: 'right' })
  await expect(page.getByRole('menu')).toBeVisible()
  expect(await check()).toEqual([])
})
