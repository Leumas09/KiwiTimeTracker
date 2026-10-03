import { expect, test } from './fixtures'
import { descriptionInput, entryRow, openApp, timerBar } from './helpers'

test('onboarding as a student renames both levels everywhere', async ({ page }) => {
  await openApp(page, 'Étudiant')
  await expect(page.getByRole('link', { name: 'Sujets' })).toBeVisible()
  await page.getByRole('link', { name: 'Sujets' }).click()
  await expect(page.getByRole('heading', { name: 'Sujets' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Matières' })).toBeVisible()
  await expect(timerBar(page).getByRole('button', { name: 'Choisir : Sujet' })).toBeVisible()
  // Not shown again.
  await page.reload()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test.describe('English browser', () => {
  test.use({ locale: 'en-US' })

  test('onboarding starts in the browser language', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Welcome to Kiwi Time Tracker' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Pro Client → Project/ })).toBeVisible()
    await page.getByRole('button', { name: 'Let’s go' }).click()
    await expect(page.getByRole('link', { name: 'Projects' })).toBeVisible()
    await page.reload()
    await expect(page.getByPlaceholder('What are you working on?')).toBeVisible()
  })
})

test('onboarding with custom labels and English', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'English', exact: true }).click()
  await page.getByRole('button', { name: /Custom/ }).click()
  await page.getByLabel('Level 1').fill('Team')
  await page.getByLabel('Level 2').fill('Initiative')
  await page.getByLabel('Plural').nth(1).fill('Initiatives')
  await page.getByRole('button', { name: 'Let’s go' }).click()
  await expect(page.getByRole('link', { name: 'Initiatives' })).toBeVisible()
  await expect(page.getByPlaceholder('What are you working on?')).toBeVisible()
})

test.describe('preferences', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, 'Pro', '/settings')
  })

  test('language persists after reload', async ({ page }) => {
    await page.getByRole('radio', { name: 'English' }).click()
    await expect(page.getByRole('heading', { name: 'Preferences' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Preferences' })).toBeVisible()
    await page.goto('/calendar')
    await expect(page.locator('.fc-today-button')).toHaveText('Today')
  })

  test('theme switches and persists', async ({ page }) => {
    await page.getByRole('radio', { name: 'Sombre' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('radio', { name: 'Clair' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('week can start on Sunday', async ({ page }) => {
    await page.getByRole('radio', { name: 'Dimanche' }).click()
    await page.goto('/timesheet')
    await expect(page.locator('thead th').nth(1)).toContainText(/^dim\./i)
    await page.goto('/calendar')
    await expect(page.locator('.fc-col-header-cell').first()).toContainText('dim.')
  })

  test('day length and duration format change how time is shown', async ({ page }) => {
    await page.getByLabel('Format des durées').selectOption('decimal')
    await page.getByLabel('Durée d’une journée (heures)').fill('8')
    await page.getByLabel('Durée d’une journée (heures)').press('Enter')

    await page.goto('/timer')
    await timerBar(page).getByRole('button', { name: 'Saisie manuelle' }).click()
    await descriptionInput(page).fill('Format test')
    await timerBar(page).getByLabel('Début').fill('8')
    await timerBar(page).getByLabel('Fin').fill('9:30')
    await timerBar(page).getByRole('button', { name: 'Ajouter', exact: true }).click()
    await expect(entryRow(page, 'Format test').getByRole('button', { name: '1,5 h' })).toBeVisible()

    await page.goto('/projects')
    await page.getByRole('button', { name: 'Migration Intune' }).first().click()
    await expect(page.getByRole('dialog').getByPlaceholder('10')).toHaveValue('10')
    await page.keyboard.press('Escape')
    await page.goto('/reports?tab=targets')
    // 10 days at 8 h a day.
    await expect(page.locator('li').filter({ hasText: 'Migration Intune' }).getByText(/\/ 10 j/)).toBeVisible()
  })

  test('rounding applies to reports but not to entries', async ({ page }) => {
    await page.getByRole('combobox', { name: 'Arrondi', exact: true }).selectOption('60')
    await page.getByRole('combobox', { name: 'Sens de l’arrondi' }).selectOption('up')

    await page.goto('/timer')
    await timerBar(page).getByRole('button', { name: 'Saisie manuelle' }).click()
    await descriptionInput(page).fill('Arrondi test')
    await timerBar(page).getByLabel('Début').fill('7')
    await timerBar(page).getByLabel('Fin').fill('7:10')
    await timerBar(page).getByRole('button', { name: 'Ajouter', exact: true }).click()
    await expect(entryRow(page, 'Arrondi test').getByRole('button', { name: '10 min' })).toBeVisible()

    await page.goto('/reports?tab=detailed')
    await page.getByPlaceholder('Rechercher une description').fill('Arrondi test')
    await expect(page.locator('tbody tr td').last()).toHaveText('1 h 00')
  })

  test('saves the display name and Pomodoro durations', async ({ page }) => {
    await page.getByLabel('Nom affiché').fill('Samuel')
    await page.getByLabel('Nom affiché').press('Enter')
    await page.getByLabel('Travail').fill('50')
    await page.getByLabel('Travail').press('Enter')
    await page.reload()
    await expect(page.getByLabel('Travail')).toHaveValue('50')
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Bonjour Samuel' })).toBeVisible()
  })

  test('renames the levels from settings', async ({ page }) => {
    await page.getByRole('button', { name: /Étudiant/ }).click()
    await expect(page.getByRole('link', { name: 'Sujets' })).toBeVisible()
    await page.getByLabel('Niveau 2').fill('Dossier')
    await page.getByLabel('Pluriel').nth(1).fill('Dossiers')
    await page.getByLabel('Pluriel').nth(1).press('Enter')
    await expect(page.getByRole('link', { name: 'Dossiers' })).toBeVisible()
  })

  test('resets the demo data', async ({ page }) => {
    await page.getByLabel('Nom affiché').fill('Temporaire')
    await page.getByLabel('Nom affiché').press('Enter')
    await page.getByRole('button', { name: 'Réinitialiser la démo' }).last().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Réinitialiser la démo' }).click()
    await expect(page.getByRole('dialog', { name: 'Bienvenue sur Kiwi Time Tracker' })).toBeVisible()
  })
})

test('dashboard shows today, week, month and budgets', async ({ page }) => {
  await openApp(page)
  for (const label of ['Aujourd’hui', 'Cette semaine', 'Ce mois-ci']) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
  }
  await expect(page.getByRole('heading', { name: 'Budgets et objectifs' })).toBeVisible()
  await expect(page.getByText('Migration Intune').first()).toBeVisible()
  await page.getByRole('link', { name: 'Détails' }).click()
  await expect(page).toHaveURL(/tab=targets/)
})

test('tabs stay in sync', async ({ page, context }) => {
  await openApp(page, 'Pro', '/timer')
  const other = await context.newPage()
  await other.goto('/timer')
  await descriptionInput(page).fill('Synchro')
  await timerBar(page).getByRole('button', { name: 'Démarrer le timer' }).click()
  await expect(timerBar(other).getByRole('button', { name: 'Arrêter le timer' })).toBeVisible()
  await expect(descriptionInput(other)).toHaveValue('Synchro')
  await timerBar(other).getByRole('button', { name: 'Arrêter le timer' }).click()
  await expect(timerBar(page).getByRole('button', { name: 'Démarrer le timer' })).toBeVisible()
})

test('works as an installable PWA', async ({ page }) => {
  await openApp(page)
  const manifest = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifest).toBeTruthy()
  const res = await page.request.get(manifest!)
  expect((await res.json()).name).toBe('Kiwi Time Tracker')
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())), { timeout: 10_000 }).toBe(true)
})

test('the build version is shown and links to the about section', async ({ page }) => {
  await openApp(page)
  const version = page.getByRole('link', { name: /^v\d+\.\d+\.\d+/ })
  await expect(version).toBeVisible()
  await version.click()
  await expect(page).toHaveURL(/\/settings#about$/)
  await expect(page.getByRole('heading', { name: 'À propos' })).toBeInViewport()
  await expect(page.getByTestId('app-version')).toHaveText(/^\d+\.\d+\.\d+$/)
})
