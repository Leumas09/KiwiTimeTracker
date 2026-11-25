import { expect, type Page } from '@playwright/test'

/**
 * A fixed "now" for the demo: the sample data is generated relative to today,
 * so without this the entries (and which project lands on which day) change
 * from one day to the next. A Wednesday afternoon, outside any DST change:
 * today already has entries and last week is complete. Time keeps flowing.
 */
export const DEMO_NOW = new Date('2026-10-07T15:00:00+02:00')

export async function pinClock(page: Page, now = DEMO_NOW) {
  await page.clock.setSystemTime(now)
}

/** Opens the app on fresh demo data (with a pinned date) and completes onboarding. */
export async function openApp(page: Page, choice: 'Pro' | 'Étudiant' = 'Pro', path = '/') {
  await pinClock(page)
  await page.goto('/')
  await page.getByRole('button', { name: choice, exact: false }).first().click()
  await page.getByRole('button', { name: 'C’est parti' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  if (path !== '/') await page.goto(path)
}

export const descriptionInput = (page: Page) => page.getByPlaceholder('Sur quoi travailles-tu ?')

/** The open popover (pickers, filters, mobile menu). */
export const popover = (page: Page) => page.locator('[data-radix-popper-content-wrapper]')

/** Picks a project in the picker opened by `trigger`. */
export async function pickProject(page: Page, trigger: ReturnType<Page['locator']>, name: string) {
  await trigger.click()
  await page.getByPlaceholder('Rechercher ou créer…').fill(name)
  await popover(page).getByRole('button', { name, exact: true }).click()
}

/** Toggles tags in the picker opened by `trigger`, then closes it. */
export async function pickTags(page: Page, trigger: ReturnType<Page['locator']>, names: string[]) {
  await trigger.click()
  for (const name of names) await popover(page).getByRole('checkbox', { name }).click()
  await page.keyboard.press('Escape')
}

/** The timer bar at the top of every page. */
export const timerBar = (page: Page) => page.locator('div.sticky').first()

/** A row of the day list, found by its description. */
export const entryRow = (page: Page, description: string) =>
  page.locator('li').filter({ has: page.locator(`input[value="${description}"]`) })

export async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}
