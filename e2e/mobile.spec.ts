import { expect, test } from './fixtures'
import { descriptionInput, noHorizontalOverflow, openApp, timerBar } from './helpers'

test('every page fits the phone width', async ({ page }) => {
  await openApp(page)
  for (const path of ['/', '/timer', '/calendar', '/timesheet', '/reports', '/reports?tab=detailed', '/reports?tab=periodic', '/reports?tab=targets', '/projects', '/settings']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await noHorizontalOverflow(page)
  }
})

test('bottom navigation and the "more" menu', async ({ page }) => {
  await openApp(page)
  const nav = page.locator('nav').last()
  await nav.getByRole('link', { name: 'Calendrier' }).click()
  await expect(page.getByRole('heading', { name: 'Calendrier' })).toBeVisible()
  // Day view by default on phones.
  await expect(page.locator('.fc-col-header-cell')).toHaveCount(1)

  await nav.getByRole('button', { name: 'Plus' }).click()
  await page.getByRole('link', { name: 'Réglages' }).click()
  await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible()
  await nav.getByRole('button', { name: 'Plus' }).click()
  await page.getByRole('link', { name: 'Timesheet' }).click()
  await expect(page.getByRole('heading', { name: 'Timesheet' })).toBeVisible()
})

test('tracks time from the phone', async ({ page }) => {
  await openApp(page, 'Pro', '/timer')
  await descriptionInput(page).fill('Depuis le téléphone')
  await timerBar(page).getByRole('button', { name: 'Démarrer le timer' }).click()
  await expect(timerBar(page).getByRole('button', { name: 'Arrêter le timer' })).toBeVisible()
  await timerBar(page).getByRole('button', { name: 'Arrêter le timer' }).click()
  await expect(page.locator('li input[value="Depuis le téléphone"]')).toBeVisible()
  await noHorizontalOverflow(page)

  // Manual entry fits too.
  await timerBar(page).getByRole('button', { name: 'Saisie manuelle' }).click()
  await descriptionInput(page).fill('Manuel mobile')
  await timerBar(page).getByLabel('Début').fill('7')
  await timerBar(page).getByLabel('Fin').fill('8')
  await noHorizontalOverflow(page)
  await timerBar(page).getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(page.locator('li input[value="Manuel mobile"]')).toBeVisible()
})

test('entry editor opens as a bottom sheet', async ({ page }) => {
  await openApp(page, 'Pro', '/timer')
  await page.locator('li').first().getByRole('button').filter({ hasText: /h|min/ }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const box = (await dialog.boundingBox())!
  const viewport = page.viewportSize()!
  expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(viewport.height - 2)
  expect(box.width).toBeGreaterThanOrEqual(viewport.width - 2)
})
