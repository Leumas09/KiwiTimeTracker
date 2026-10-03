import { expect, test } from './fixtures'
import { descriptionInput, entryRow, openApp, pickProject, pickTags, timerBar } from './helpers'

test.beforeEach(async ({ page }) => {
  await openApp(page, 'Pro', '/timer')
})

test('starts and stops a timer with project and tags', async ({ page }) => {
  const bar = timerBar(page)
  await descriptionInput(page).fill('Préparer le comité')
  await pickProject(page, bar.getByRole('button', { name: 'Choisir : Projet' }), 'Audit sécurité')
  await pickTags(page, bar.getByRole('button', { name: 'Tags' }), ['réunion'])
  await bar.getByRole('button', { name: 'Démarrer le timer' }).click()

  await expect(bar.getByRole('button', { name: 'Arrêter le timer' })).toBeVisible()
  await expect(page).toHaveTitle(/^0:00:0\d · Préparer le comité$/)
  await page.waitForTimeout(1200)
  await expect(page).toHaveTitle(/^0:00:0[1-9]/)

  await bar.getByRole('button', { name: 'Arrêter le timer' }).click()
  await expect(bar.getByRole('button', { name: 'Démarrer le timer' })).toBeVisible()
  await expect(descriptionInput(page)).toHaveValue('')
  await expect(page).toHaveTitle('Kiwi Time Tracker')

  const row = entryRow(page, 'Préparer le comité')
  await expect(row).toHaveCount(1)
  await expect(row.getByRole('button', { name: 'Audit sécurité' })).toBeVisible()
  await expect(row.getByText('réunion')).toBeVisible()
})

test('keeps running across a reload and saves edits made while running', async ({ page }) => {
  const bar = timerBar(page)
  await descriptionInput(page).fill('Brouillon')
  await bar.getByRole('button', { name: 'Démarrer le timer' }).click()
  await expect(bar.getByRole('button', { name: 'Arrêter le timer' })).toBeVisible()

  await descriptionInput(page).fill('Rédaction finale')
  await descriptionInput(page).press('Enter')
  await pickProject(page, bar.getByRole('button', { name: 'Choisir : Projet' }), 'Veille')

  await page.reload()
  await expect(bar.getByRole('button', { name: 'Arrêter le timer' })).toBeVisible()
  await expect(descriptionInput(page)).toHaveValue('Rédaction finale')
  await expect(bar.getByRole('button', { name: 'Veille' })).toBeVisible()

  await bar.getByRole('button', { name: 'Arrêter le timer' }).click()
  await expect(entryRow(page, 'Rédaction finale').getByRole('button', { name: 'Veille' })).toBeVisible()
})

test('edits the start time of the running entry', async ({ page }) => {
  const bar = timerBar(page)
  await descriptionInput(page).fill('Commencé plus tôt')
  await bar.getByRole('button', { name: 'Démarrer le timer' }).click()
  await bar.getByRole('button', { name: 'Modifier l’entrée en cours' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Timer en cours…')).toBeVisible()
  // Computed in the browser, which runs in the test time zone.
  const { hhmm, sameDay } = await page.evaluate(() => {
    const now = new Date()
    const start = new Date(now.getTime() - 75 * 60_000)
    const pad = (n: number) => String(n).padStart(2, '0')
    return { hhmm: `${pad(start.getHours())}:${pad(start.getMinutes())}`, sameDay: start.getDate() === now.getDate() }
  })
  test.skip(!sameDay, 'too close to midnight')
  await dialog.getByLabel('Début').fill(hhmm)
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(dialog).toBeHidden()
  await expect(bar.getByRole('button', { name: 'Modifier l’entrée en cours' })).toHaveText(/^1:1\d:\d\d$/)
})

test('edits made in the running entry dialog show up in the bar', async ({ page }) => {
  const bar = timerBar(page)
  await descriptionInput(page).fill('Avant')
  await bar.getByRole('button', { name: 'Démarrer le timer' }).click()
  await bar.getByRole('button', { name: 'Modifier l’entrée en cours' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Description').fill('Après')
  await pickProject(page, dialog.getByRole('button', { name: 'Choisir : Projet' }), 'Veille')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(descriptionInput(page)).toHaveValue('Après')
  await expect(bar.getByRole('button', { name: 'Veille' })).toBeVisible()
  // Focusing and leaving the field does not bring the old text back.
  await descriptionInput(page).focus()
  await descriptionInput(page).blur()
  await page.reload()
  await expect(descriptionInput(page)).toHaveValue('Après')
})

test('continues a past entry with the same details', async ({ page }) => {
  const row = page.locator('li').filter({ has: page.locator('input') }).first()
  const description = await row.locator('input').inputValue()
  await row.hover()
  await row.getByRole('button', { name: 'Continuer cette entrée' }).click()
  await expect(timerBar(page).getByRole('button', { name: 'Arrêter le timer' })).toBeVisible()
  await expect(descriptionInput(page)).toHaveValue(description)

  // Continuing another entry while running switches the timer: one running entry only.
  const other = page.locator('li').filter({ has: page.locator('input') }).nth(2)
  const otherDescription = await other.locator('input').inputValue()
  await other.hover()
  await other.getByRole('button', { name: 'Continuer cette entrée' }).click()
  await expect(descriptionInput(page)).toHaveValue(otherDescription)
  await timerBar(page).getByRole('button', { name: 'Arrêter le timer' }).click()
  await expect(timerBar(page).getByRole('button', { name: 'Démarrer le timer' })).toBeVisible()
})

test('adds a manual entry, including one past midnight', async ({ page }) => {
  const bar = timerBar(page)
  await bar.getByRole('button', { name: 'Saisie manuelle' }).click()
  await descriptionInput(page).fill('Atelier du matin')
  await bar.getByLabel('Début').fill('9')
  await bar.getByLabel('Fin').fill('10h30')
  await bar.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(entryRow(page, 'Atelier du matin').getByRole('button', { name: '1 h 30' })).toBeVisible()

  await descriptionInput(page).fill('Mise en production')
  await bar.getByLabel('Début').fill('22:00')
  await bar.getByLabel('Fin').fill('01:00')
  await bar.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(entryRow(page, 'Mise en production').getByRole('button', { name: '3 h 00' })).toBeVisible()

  // Invalid times keep the button disabled.
  await bar.getByLabel('Début').fill('25:00')
  await expect(bar.getByRole('button', { name: 'Ajouter', exact: true })).toBeDisabled()
})

test('suggests recent entries and fills their project', async ({ page }) => {
  const bar = timerBar(page)
  await descriptionInput(page).fill('Revue des')
  await page.getByRole('option', { name: /Revue des comptes à privilèges/ }).click()
  await expect(descriptionInput(page)).toHaveValue('Revue des comptes à privilèges')
  await expect(bar.getByRole('button', { name: 'Audit sécurité' })).toBeVisible()
})

test('creates a project from the picker', async ({ page }) => {
  const bar = timerBar(page)
  await bar.getByRole('button', { name: 'Choisir : Projet' }).click()
  await page.getByPlaceholder('Rechercher ou créer…').fill('Projet express')
  await page.getByRole('button', { name: 'Créer « Projet express »' }).click()
  await expect(bar.getByRole('button', { name: 'Projet express' })).toBeVisible()
  await page.goto('/projects')
  await expect(page.getByText('Projet express')).toBeVisible()
})

test('edits, duplicates and deletes an entry', async ({ page }) => {
  const bar = timerBar(page)
  await bar.getByRole('button', { name: 'Saisie manuelle' }).click()
  await descriptionInput(page).fill('À modifier')
  await bar.getByLabel('Début').fill('8')
  await bar.getByLabel('Fin').fill('9')
  await bar.getByRole('button', { name: 'Ajouter', exact: true }).click()

  const row = entryRow(page, 'À modifier')
  await row.getByRole('button', { name: '1 h 00' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Description').fill('Modifiée')
  await dialog.getByLabel('Durée').fill('2:15')
  await dialog.getByLabel('Durée').blur()
  await expect(dialog.getByLabel('Fin')).toHaveValue('10:15')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(entryRow(page, 'Modifiée').getByRole('button', { name: '2 h 15' })).toBeVisible()

  await entryRow(page, 'Modifiée').getByRole('button', { name: '2 h 15' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Dupliquer' }).click()
  await expect(entryRow(page, 'Modifiée')).toHaveCount(2)

  await entryRow(page, 'Modifiée').first().getByRole('button', { name: '2 h 15' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()
  await expect(entryRow(page, 'Modifiée')).toHaveCount(1)
  // Deleting can be undone from the toast.
  await page.getByText('Entrée supprimée.').locator('..').getByRole('button', { name: 'Annuler' }).click()
  await expect(entryRow(page, 'Modifiée')).toHaveCount(2)
})

test('renames an entry inline', async ({ page }) => {
  const input = page.locator('li input').first()
  await input.fill('Renommée en ligne')
  await input.press('Enter')
  await page.reload()
  await expect(page.locator('li input[value="Renommée en ligne"]')).toHaveCount(1)
})

test('loads older weeks', async ({ page }) => {
  const days = page.locator('section h2')
  const before = await days.count()
  await page.getByRole('button', { name: 'Charger plus' }).click()
  await expect.poll(() => days.count()).toBeGreaterThan(before)
})
