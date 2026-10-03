import { expect, test } from './fixtures'
import { descriptionInput, entryRow, openApp, pickTags, popover, timerBar } from './helpers'

test.beforeEach(async ({ page }) => {
  await openApp(page, 'Pro', '/projects')
})

test('creates a client and a project with budget and goal', async ({ page }) => {
  await page.getByRole('radio', { name: 'Clients' }).click()
  await page.getByRole('button', { name: 'Ajouter : Client' }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nom').fill('Nouveau client')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('Nouveau client')).toBeVisible()

  await page.getByRole('radio', { name: 'Projets' }).click()
  await page.getByRole('button', { name: 'Ajouter : Projet' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nom').fill('Refonte intranet')
  await dialog.getByLabel('Client').selectOption({ label: 'Nouveau client' })
  await dialog.getByPlaceholder('10').fill('6,5')
  await dialog.getByPlaceholder('5').fill('4')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()

  const group = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Nouveau client' }) })
  await expect(group.getByText('Refonte intranet')).toBeVisible()
  await expect(group.getByText('Budget 6,5 j · 4 heures / semaine')).toBeVisible()

  // The budget shows up in reports.
  await page.goto('/reports?tab=targets')
  const card = page.locator('li').filter({ hasText: 'Refonte intranet' })
  await expect(card.getByText('0 j / 6,5 j · 0 %')).toBeVisible()
  await expect(card.getByText('Objectif cette semaine')).toBeVisible()
})

test('edits a project and clears its goal', async ({ page }) => {
  await page.getByRole('button', { name: 'Formation MFA' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByPlaceholder('5')).toHaveValue('3')
  await dialog.getByLabel('Nom').fill('Formation MFA v2')
  await dialog.getByPlaceholder('5').fill('')
  await dialog.getByRole('button', { name: '#E34948' }).click()
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  const row = page.locator('li').filter({ hasText: 'Formation MFA v2' })
  await expect(row).toBeVisible()
  await expect(row.getByText(/semaine/)).toHaveCount(0)
})

test('archives and restores a project', async ({ page }) => {
  const row = page.locator('li').filter({ hasText: 'Veille' })
  await row.getByRole('button', { name: 'Archiver' }).click()
  await expect(page.locator('li').filter({ hasText: 'Veille' })).toHaveCount(0)

  // Archived projects are not offered when tracking time.
  await timerBar(page).getByRole('button', { name: 'Choisir : Projet' }).click()
  await page.getByPlaceholder('Rechercher ou créer…').fill('Veille')
  await expect(popover(page).getByRole('button', { name: 'Veille', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await page.getByLabel('Afficher les éléments archivés').check()
  const archived = page.locator('li').filter({ hasText: 'Veille' })
  await expect(archived.getByText('Archivé')).toBeVisible()
  await archived.getByRole('button', { name: 'Désarchiver' }).click()
  await page.getByLabel('Afficher les éléments archivés').uncheck()
  await expect(page.locator('li').filter({ hasText: 'Veille' })).toHaveCount(1)
})

test('deleting a client keeps its projects', async ({ page }) => {
  await page.getByRole('radio', { name: 'Clients' }).click()
  await page.locator('li').filter({ hasText: 'ACME Industries' }).getByRole('button', { name: 'Supprimer' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()
  await expect(page.getByText('ACME Industries')).toHaveCount(0)

  await page.getByRole('radio', { name: 'Projets' }).click()
  const orphans = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Sans Client' }) })
  await expect(orphans.getByText('Audit sécurité')).toBeVisible()
  await expect(orphans.getByText('Migration Intune')).toBeVisible()
})

test('deleting a project keeps its time entries', async ({ page }) => {
  await page.locator('li').filter({ hasText: 'Veille' }).getByRole('button', { name: 'Supprimer' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()
  await page.goto('/timer')
  await expect(page.locator('li input[value="Lecture Microsoft Learn"]').first()).toBeVisible()
})

test('creates, renames and deletes tags', async ({ page }) => {
  await page.getByRole('radio', { name: 'Tags' }).click()
  await page.getByPlaceholder('Nouveau tag').fill('client sur site')
  await page.getByRole('button', { name: 'Ajouter' }).click()
  await expect(page.locator('input[value="client sur site"]')).toBeVisible()
  await page.getByPlaceholder('Nouveau tag').fill('Réunion')
  await page.getByRole('button', { name: 'Ajouter' }).click()
  await expect(page.getByText('Ce nom existe déjà.')).toBeVisible()
  await page.getByPlaceholder('Nouveau tag').fill('')

  // Use it on an entry.
  await page.goto('/timer')
  await timerBar(page).getByRole('button', { name: 'Saisie manuelle' }).click()
  await descriptionInput(page).fill('Sur site')
  await pickTags(page, timerBar(page).getByRole('button', { name: 'Tags' }), ['client sur site'])
  await timerBar(page).getByLabel('Début').fill('8')
  await timerBar(page).getByLabel('Fin').fill('9')
  await timerBar(page).getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(entryRow(page, 'Sur site').getByText('client sur site')).toBeVisible()

  await page.goto('/projects')
  await page.getByRole('radio', { name: 'Tags' }).click()
  // A handle, because the value attribute changes while typing.
  const input = (await page.locator('input[value="client sur site"]').elementHandle())!
  await input.fill('sur site')
  await input.press('Enter')
  await page.goto('/timer')
  await expect(entryRow(page, 'Sur site').getByText('sur site', { exact: true })).toBeVisible()

  await page.goto('/projects')
  await page.getByRole('radio', { name: 'Tags' }).click()
  await page.locator('li').filter({ has: page.locator('input[value="sur site"]') }).getByRole('button', { name: 'Supprimer' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()
  await expect(page.locator('input[value="sur site"]')).toHaveCount(0)
  await page.goto('/timer')
  await expect(entryRow(page, 'Sur site').getByText('sur site', { exact: true })).toHaveCount(0)
})
