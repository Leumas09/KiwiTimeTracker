import { expect, test } from './fixtures'
import { openApp } from './helpers'

test.use({ viewport: { width: 1824, height: 1125 } })

test('the calendar uses the full width, other pages keep a max width', async ({ page }) => {
  await openApp(page, 'Pro', '/calendar')
  await expect(page.locator('.fc-event').first()).toBeVisible()
  const main = page.getByRole('main')
  const sidebar = 240
  expect((await main.boundingBox())!.width).toBeGreaterThanOrEqual(1824 - sidebar - 2)
  await page.getByRole('link', { name: 'Tableau de bord' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect.poll(async () => (await main.boundingBox())!.width).toBeLessThanOrEqual(1152)
})
