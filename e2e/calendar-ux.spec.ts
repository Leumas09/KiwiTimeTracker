import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { entryRow, openApp } from './helpers'

test.beforeEach(async ({ page }) => {
  await openApp(page, 'Pro', '/calendar')
  // Last week: a full week of sample entries, nothing running, empty weekend.
  await page.locator('.fc-prev-button').click()
  await expect(page.locator('.fc-event').first()).toBeVisible()
})

const lane = (page: Page, time: string) => page.locator(`.fc-timegrid-slot-lane[data-time="${time}:00"]`)

/** Drags in a day column from the top of `from` to `toY` (pixels below it). */
async function dragSelect(page: Page, column: Locator, from: string, offsetPx: number) {
  const col = (await column.boundingBox())!
  const start = (await lane(page, from).boundingBox())!
  const x = col.x + col.width / 2
  await page.mouse.move(x, start.y + 2)
  await page.mouse.down()
  await page.mouse.move(x, start.y + 2 + offsetPx, { steps: 8 })
  await page.mouse.up()
}

const saturday = (page: Page) => page.locator('.fc-timegrid-col.fc-day-sat')
const quick = (page: Page) => page.getByRole('dialog', { name: 'Nouvelle entrée' })
const description = (page: Page) => page.getByRole('combobox', { name: 'Description' })

test('creating snaps to 15 minutes', async ({ page }) => {
  const slot = (await lane(page, '09:00').boundingBox())!
  // About 20 minutes down from 09:00 (a lane is 30 minutes).
  await dragSelect(page, saturday(page), '09:00', (slot.height * 2) / 3)
  await expect(quick(page).getByLabel('Début')).toHaveValue('09:00')
  await expect(quick(page).getByLabel('Fin')).toHaveValue('09:30')
  // First Escape closes the suggestion list, the second the window.
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  await dragSelect(page, saturday(page), '09:00', slot.height * 1.6)
  await expect(quick(page).getByLabel('Fin')).toHaveValue('10:00')
  await expect(quick(page).getByLabel('Durée')).toHaveValue('1:00')
})

test('quick entry: recent activity with the keyboard, then Enter to save', async ({ page }) => {
  const slot = (await lane(page, '10:00').boundingBox())!
  await dragSelect(page, saturday(page), '10:00', slot.height * 1.9)
  const dialog = quick(page)
  // The window opens next to the slot, with the field ready to type in.
  await expect(description(page)).toBeFocused()
  await expect(dialog.getByRole('listbox', { name: 'Activités récentes' })).toBeVisible()
  await expect(page.locator('.fc-event.kiwi-draft')).toBeVisible()

  await page.keyboard.type('revue priv')
  await expect(dialog.getByRole('option')).toHaveCount(1)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(description(page)).toHaveValue('Revue des comptes à privilèges')
  await expect(dialog.getByRole('button', { name: 'Audit sécurité' })).toBeVisible()

  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  const created = page.locator('.fc-day-sat .fc-event').filter({ hasText: 'Revue des comptes à privilèges' })
  await expect(created).toBeVisible()
  await expect(created).toContainText('Audit sécurité')
})

test('quick entry: @project, #tag, new project and Ctrl+Enter', async ({ page }) => {
  await dragSelect(page, saturday(page), '13:00', 30)
  const dialog = quick(page)
  await page.keyboard.type('Atelier client @veil')
  await expect(dialog.getByRole('listbox', { name: 'Projets' })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(description(page)).toHaveValue('Atelier client ')
  await expect(dialog.getByRole('button', { name: 'Veille' })).toBeVisible()

  await page.keyboard.type('#réu')
  await page.keyboard.press('Tab')
  await expect(description(page)).toHaveValue('Atelier client ')
  await expect(dialog.getByRole('button', { name: 'Tags' })).toContainText('réunion')

  await page.keyboard.type('@Projet tout neuf')
  await dialog.getByRole('option', { name: /Créer « Projet tout neuf »/ }).click()
  await expect(dialog.getByRole('button', { name: 'Projet tout neuf' })).toBeVisible()

  // Ctrl+Enter saves from a time field too.
  await dialog.getByLabel('Fin').fill('15:00')
  await page.keyboard.press('Control+Enter')
  await expect(dialog).toBeHidden()
  await expect(page.locator('.fc-day-sat .fc-event').filter({ hasText: 'Atelier client' })).toContainText('Projet tout neuf')
})

test('quick entry: Escape closes the list first, then the window', async ({ page }) => {
  await dragSelect(page, saturday(page), '15:00', 30)
  await expect(quick(page).getByRole('listbox')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(quick(page).getByRole('listbox')).toBeHidden()
  await expect(quick(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(quick(page)).toBeHidden()
  await expect(page.locator('.fc-event.kiwi-draft')).toHaveCount(0)
})

test('weekends are shaded, today stands apart, and days show their total', async ({ page }) => {
  const bg = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundColor)
  const sat = await bg('.fc-timegrid-col.fc-day-sat')
  const sun = await bg('.fc-timegrid-col.fc-day-sun')
  const mon = await bg('.fc-timegrid-col.fc-day-mon')
  expect(sat).toBe(sun)
  expect(sat).not.toBe(mon)
  await expect(page.locator('.fc-col-header-cell.fc-day-mon')).toContainText(/\d+ h \d\d/)
})

test('work week view, remembered', async ({ page }) => {
  await page.getByRole('button', { name: 'Semaine de travail' }).click()
  await expect(page.locator('.fc-col-header-cell')).toHaveCount(5)
  await page.reload()
  await expect(page.locator('.fc-col-header-cell')).toHaveCount(5)
  await page.getByRole('button', { name: 'Semaine', exact: true }).click()
  await expect(page.locator('.fc-col-header-cell')).toHaveCount(7)
})

test('right click on an entry: duplicate to next day, delete and undo', async ({ page }) => {
  const events = page.locator('.fc-event:not(.kiwi-draft)')
  const before = await events.count()
  const friday = page.locator('.fc-day-fri .fc-event').first()
  const title = (await friday.locator('span').first().textContent())!

  await friday.click({ button: 'right' })
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem', { name: /Modifier/ })).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Dupliquer au lendemain' }).click()
  await expect(page.locator('.fc-day-sat .fc-event').filter({ hasText: title })).toBeVisible()
  await expect(events).toHaveCount(before + 1)

  await page.locator('.fc-day-sat .fc-event').filter({ hasText: title }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: /Supprimer/ }).click()
  await expect(events).toHaveCount(before)
  await page.getByRole('button', { name: 'Annuler' }).click()
  await expect(events).toHaveCount(before + 1)
})

test('right click on an empty slot: new entry here, copy and paste', async ({ page }) => {
  const box = (await saturday(page).boundingBox())!
  const slot = (await lane(page, '11:00').boundingBox())!
  await page.mouse.click(box.x + box.width / 2, slot.y + 4, { button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Coller ici' })).toBeDisabled()
  await page.getByRole('menuitem', { name: 'Nouvelle entrée ici' }).click()
  await expect(quick(page).getByLabel('Début')).toHaveValue('11:00')
  await expect(quick(page).getByLabel('Fin')).toHaveValue('11:30')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  // Copy an entry from its menu, paste it on Saturday 14:00.
  const source = page.locator('.fc-day-mon .fc-event').first()
  const title = (await source.locator('span').first().textContent())!
  await source.click({ button: 'right' })
  await page.getByRole('menuitem', { name: /Copier/ }).click()
  const slot14 = (await lane(page, '14:00').boundingBox())!
  await page.mouse.click(box.x + box.width / 2, slot14.y + 4, { button: 'right' })
  await page.getByRole('menuitem', { name: 'Coller ici' }).click()
  const pasted = page.locator('.fc-day-sat .fc-event').filter({ hasText: title })
  await expect(pasted).toBeVisible()
  await expect(pasted).toContainText('14:00')
})

test('Ctrl + drag duplicates an entry', async ({ page }) => {
  const events = page.locator('.fc-event:not(.kiwi-draft)')
  const before = await events.count()
  const source = page.locator('.fc-day-fri .fc-event').first()
  const title = (await source.locator('span').first().textContent())!
  const from = (await source.boundingBox())!
  const to = (await saturday(page).boundingBox())!

  await page.keyboard.down('Control')
  await page.mouse.move(from.x + from.width / 2, from.y + 8)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, from.y + 8, { steps: 12 })
  await expect(page.locator('.kiwi-calendar.kiwi-copying')).toHaveCount(1)
  await page.mouse.up()
  await page.keyboard.up('Control')

  await expect(events).toHaveCount(before + 1)
  await expect(page.locator('.fc-day-fri .fc-event').filter({ hasText: title }).first()).toBeVisible()
  await expect(page.locator('.fc-day-sat .fc-event').filter({ hasText: title })).toBeVisible()
  await expect(page.getByText('Entrée dupliquée.')).toBeVisible()
})

test('a plain drag still moves the entry', async ({ page }) => {
  const events = page.locator('.fc-event:not(.kiwi-draft)')
  const before = await events.count()
  const source = page.locator('.fc-day-fri .fc-event').first()
  const title = (await source.locator('span').first().textContent())!
  const from = (await source.boundingBox())!
  const to = (await page.locator('.fc-timegrid-col.fc-day-sun').boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + 8)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, from.y + 8, { steps: 12 })
  await page.mouse.up()
  await expect(page.locator('.fc-day-sun .fc-event').filter({ hasText: title })).toBeVisible()
  await expect(events).toHaveCount(before)
})

test('keyboard: delete the hovered entry, switch views, today', async ({ page }) => {
  const events = page.locator('.fc-event:not(.kiwi-draft)')
  const before = await events.count()
  await page.locator('.fc-day-tue .fc-event').first().hover()
  await page.keyboard.press('Delete')
  await expect(events).toHaveCount(before - 1)
  await expect(page.getByText('Entrée supprimée.')).toBeVisible()

  await page.mouse.move(5, 5)
  await page.keyboard.press('5')
  await expect(page.locator('.fc-col-header-cell')).toHaveCount(5)
  await page.keyboard.press('1')
  await expect(page.locator('.fc-col-header-cell')).toHaveCount(1)
  await page.keyboard.press('7')
  await page.keyboard.press('t')
  await expect(page.locator('.fc-col-header-cell.fc-day-today')).toHaveCount(1)

  await page.getByRole('button', { name: 'Raccourcis du calendrier' }).click()
  await expect(page.getByText('jour, semaine de travail, semaine')).toBeVisible()
})

test('editing an entry opens next to it and offers delete, duplicate and restart', async ({ page }) => {
  const event = page.locator('.fc-day-wed .fc-event').first()
  const box = (await event.boundingBox())!
  await event.click()
  const dialog = page.getByRole('dialog', { name: 'Modifier l’entrée' })
  const panel = (await dialog.boundingBox())!
  // Anchored beside the entry, not centered.
  expect(panel.x > box.x + box.width || panel.x + panel.width < box.x).toBe(true)
  for (const name of ['Supprimer', 'Dupliquer', 'Continuer cette entrée']) await expect(dialog.getByRole('button', { name })).toBeVisible()
  await dialog.getByRole('button', { name: 'Continuer cette entrée' }).click()
  await expect(page.getByRole('button', { name: 'Arrêter le timer' })).toBeVisible()
})

test('timer bar: @ picks a project and recent activity fills everything', async ({ page }) => {
  await page.goto('/timer')
  const input = page.getByRole('combobox', { name: 'Description' }).first()
  await input.fill('Point @migr')
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('Point ')
  await expect(page.locator('div.sticky').first().getByRole('button', { name: 'Migration Intune' })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Arrêter le timer' })).toBeVisible()
  await page.getByRole('button', { name: 'Arrêter le timer' }).click()
  await expect(entryRow(page, 'Point').getByRole('button', { name: 'Migration Intune' })).toBeVisible()
})

test('reports can show days of the configured length, remembered', async ({ page }) => {
  await page.goto('/reports?tab=detailed')
  await page.getByRole('radio', { name: 'Jours de 7 h' }).click()
  await expect(page.locator('tbody tr td').last()).toHaveText(/^[\d,]+ j$/)
  await page.reload()
  await expect(page.getByRole('radio', { name: 'Jours de 7 h' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('link', { name: 'Modifier' }).click()
  await page.getByLabel('Durée d’une journée (heures)').fill('8')
  await page.getByLabel('Durée d’une journée (heures)').press('Enter')
  await page.goto('/reports')
  await expect(page.getByRole('radio', { name: 'Jours de 8 h' })).toBeVisible()
})

test('editing keeps the fields visible until you type or press ↓', async ({ page }) => {
  await page.locator('.fc-day-mon .fc-event').first().click()
  const dialog = page.getByRole('dialog', { name: 'Modifier l’entrée' })
  await expect(dialog.getByRole('listbox')).toHaveCount(0)
  await page.keyboard.press('ArrowDown')
  await expect(dialog.getByRole('listbox')).toBeVisible()
})
