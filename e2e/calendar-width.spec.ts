import { expect, test } from './fixtures'
import { openApp } from './helpers'

const SIDEBAR = 240

test.use({ viewport: { width: 1824, height: 1125 } })

test('the calendar uses the full width, other pages keep a max width', async ({ page }) => {
  await openApp(page, 'Pro', '/calendar')
  await expect(page.locator('.fc-event').first()).toBeVisible()
  const main = page.getByRole('main')
  expect((await main.boundingBox())!.width).toBeGreaterThanOrEqual(1824 - SIDEBAR - 2)
  await page.getByRole('link', { name: 'Tableau de bord' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect.poll(async () => (await main.boundingBox())!.width).toBeLessThanOrEqual(1152)
})

test('the calendar follows the window when it is resized', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 })
  await openApp(page, 'Pro', '/calendar')
  await expect(page.locator('.fc-event').first()).toBeVisible()
  const grid = page.locator('.fc-view-harness')
  const height = (await grid.boundingBox())!.height
  await page.setViewportSize({ width: 2400, height: 1300 })
  await expect.poll(async () => (await grid.boundingBox())!.width).toBeGreaterThan(2400 - SIDEBAR - 120)
  await expect.poll(async () => (await grid.boundingBox())!.height).toBeGreaterThan(height + 400)
})
