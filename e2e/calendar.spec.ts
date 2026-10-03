import { expect, test } from './fixtures'
import { openApp } from './helpers'

test.beforeEach(async ({ page }) => {
  await openApp(page, 'Pro', '/calendar')
  // Last week: a full week of sample entries, nothing running.
  await page.locator('.fc-prev-button').click()
  await expect(page.locator('.fc-event').first()).toBeVisible()
})

test('shows the week with a total and switches to the day view', async ({ page }) => {
  await expect(page.locator('.fc-col-header-cell')).toHaveCount(7)
  await expect(page.getByText('Total affiché :')).toContainText(/\d+ h \d\d/)
  await page.locator('.fc-timeGridDay-button').click()
  await expect(page.locator('.fc-col-header-cell')).toHaveCount(1)
})

test('creates an entry by selecting a slot', async ({ page }) => {
  // Saturday 09:00 → 10:30, always empty in the sample data and visible.
  const column = page.locator('.fc-timegrid-col').nth(5)
  const box = await column.boundingBox()
  const slot18 = await page.locator('.fc-timegrid-slot-lane[data-time="09:00:00"]').boundingBox()
  const slot19 = await page.locator('.fc-timegrid-slot-lane[data-time="10:00:00"]').boundingBox()
  const x = box!.x + box!.width / 2
  await page.mouse.move(x, slot18!.y + 4)
  await page.mouse.down()
  await page.mouse.move(x, slot19!.y + slot19!.height - 4, { steps: 8 })
  await page.mouse.up()

  const dialog = page.getByRole('dialog', { name: 'Nouvelle entrée' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Début')).toHaveValue('09:00')
  await expect(dialog.getByLabel('Fin')).toHaveValue('10:30')
  await dialog.getByLabel('Description').fill('Créée au calendrier')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.locator('.fc-event').filter({ hasText: 'Créée au calendrier' })).toBeVisible()
})

test('moves an entry by drag and drop', async ({ page }) => {
  const event = page.locator('.fc-event').first()
  const title = (await event.locator('span').first().textContent())!
  const before = (await event.locator('span').last().textContent())!
  const box = (await event.boundingBox())!
  const slot = (await page.locator('.fc-timegrid-slot-lane[data-time="08:00:00"]').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 6)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + 6 + slot.height * 2, { steps: 10 })
  await page.mouse.up()
  const moved = page.locator('.fc-event').filter({ hasText: title }).first()
  await expect(moved.locator('span').last()).not.toHaveText(before)

  // The move is saved.
  await page.reload()
  await page.locator('.fc-prev-button').click()
  await expect(page.locator('.fc-event').filter({ hasText: title }).first().locator('span').last()).not.toHaveText(before)
})

test('opens an entry for editing', async ({ page }) => {
  await page.locator('.fc-event').first().click()
  const dialog = page.getByRole('dialog', { name: 'Modifier l’entrée' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Description').fill('Renommée depuis le calendrier')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.locator('.fc-event').filter({ hasText: 'Renommée depuis le calendrier' })).toBeVisible()
})
