import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { openApp, popover } from './helpers'

test.beforeEach(async ({ page }) => {
  await openApp(page, 'Pro', '/timesheet')
  // Last week is fully in the past, so no running time interferes.
  await page.getByRole('button', { name: 'Précédent' }).click()
})

const row = (page: Page, project: string) => page.locator('tbody tr').filter({ hasText: project })
const total = (page: Page) => page.locator('tfoot td').last()

test('sets, raises, lowers and clears a cell', async ({ page }) => {
  const r = row(page, 'Veille')
  const saturday = r.locator('input').nth(5)
  await saturday.fill('2:30')
  await saturday.press('Enter')
  await expect(saturday).toHaveValue('2:30')

  await saturday.fill('3h')
  await saturday.press('Enter')
  await expect(saturday).toHaveValue('3:00')

  await saturday.fill('45m')
  await saturday.press('Enter')
  await expect(saturday).toHaveValue('0:45')

  await saturday.fill('')
  await saturday.press('Enter')
  await expect(saturday).toHaveValue('')
})

test('keeps totals consistent and ignores invalid input', async ({ page }) => {
  const before = await total(page).textContent()
  const r = row(page, 'Administratif')
  const sunday = r.locator('input').nth(6)
  await sunday.fill('n’importe quoi')
  await sunday.press('Enter')
  await expect(sunday).toHaveValue('')
  await expect(total(page)).toHaveText(before!)

  await sunday.fill('1')
  await sunday.press('Enter')
  await expect(total(page)).not.toHaveText(before!)
  await expect(r.locator('td').last()).toContainText(/h/)
})

test('adds a row for a project without time this week', async ({ page }) => {
  await page.getByRole('button', { name: 'Suivant' }).click()
  await page.getByRole('button', { name: 'Suivant' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.locator('tbody').getByRole('button', { name: 'Choisir : Projet' }).click()
  await popover(page).getByRole('button', { name: 'Formation MFA', exact: true }).click()
  const r = row(page, 'Formation MFA')
  await r.locator('input').first().fill('1,5')
  await r.locator('input').first().press('Enter')
  await expect(r.locator('input').first()).toHaveValue('1:30')
  await expect(total(page)).toHaveText('1 h 30')
})

test('navigates between weeks', async ({ page }) => {
  const label = page.locator('h1 ~ div span').last()
  const lastWeek = await label.textContent()
  await page.getByRole('button', { name: 'Cette semaine' }).click()
  await expect(label).not.toHaveText(lastWeek!)
  await page.getByRole('button', { name: 'Précédent' }).click()
  await expect(label).toHaveText(lastWeek!)
})
