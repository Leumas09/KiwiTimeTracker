import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { openApp, popover } from './helpers'

test.beforeEach(async ({ page }) => {
  await openApp(page, 'Pro', '/reports')
  await page.getByLabel('Période').selectOption({ label: '30 derniers jours' })
})

const kpi = (page: Page, label: string) => page.locator('div').filter({ hasText: new RegExp(`^${label}`) }).locator('.font-display').first()

async function filter(page: Page, button: string, option: string) {
  await page.getByRole('button', { name: button, exact: true }).click()
  await popover(page).getByRole('checkbox', { name: option }).click()
  await page.keyboard.press('Escape')
}

test('summary shows totals, chart, donut and breakdown', async ({ page }) => {
  await expect(kpi(page, 'Total')).toHaveText(/\d+ h \d\d/)
  await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible()
  await expect(page.locator('.recharts-pie-sector').first()).toBeVisible()
  const table = page.locator('table').last()
  await expect(table.getByText('Audit sécurité')).toBeVisible()

  // Percentages add up to about 100 %.
  const percents = await table.locator('td:last-child').allTextContents()
  const sum = percents.map((p) => Number(p.replace(/[^\d]/g, ''))).reduce((a, b) => a + b, 0)
  expect(sum).toBeGreaterThanOrEqual(98)
  expect(sum).toBeLessThanOrEqual(102)
})

test('groups by client with project detail, and by tag', async ({ page }) => {
  await page.getByRole('radio', { name: 'Client' }).click()
  const table = page.locator('table').last()
  await expect(table.getByText('ACME Industries')).toBeVisible()
  await expect(table.getByText('Migration Intune')).toBeVisible()
  await page.getByRole('radio', { name: 'Tag' }).click()
  await expect(table.getByText('Sans tag')).toBeVisible()
})

test('filters by project, tag and text', async ({ page }) => {
  const total = await kpi(page, 'Total').textContent()
  await filter(page, 'Projets', 'Veille')
  const table = page.locator('table').last()
  await expect(table.locator('tr')).toHaveCount(1)
  await expect(table.getByText('Veille')).toBeVisible()
  await expect(kpi(page, 'Total')).not.toHaveText(total!)

  await page.getByRole('button', { name: 'Effacer les filtres' }).click()
  await expect(kpi(page, 'Total')).toHaveText(total!)

  await page.getByPlaceholder('Rechercher une description').fill('Facturation')
  await page.getByRole('radio', { name: 'Détaillé' }).click()
  const rows = page.locator('tbody tr')
  await expect(rows.first()).toContainText('Facturation')
  for (const text of await rows.allTextContents()) expect(text).toContain('Facturation')
})

test('switches to days', async ({ page }) => {
  await page.getByRole('radio', { name: 'Jours' }).click()
  await expect(kpi(page, 'Total')).toHaveText(/^[\d,]+ j$/)
})

test('detailed list opens an entry', async ({ page }) => {
  await page.getByRole('radio', { name: 'Détaillé' }).click()
  await expect(page.getByText(/\d+ entrées/)).toBeVisible()
  await page.locator('tbody tr').first().click()
  await expect(page.getByRole('dialog', { name: 'Modifier l’entrée' })).toBeVisible()
})

test('weekly and monthly matrix', async ({ page }) => {
  await page.getByRole('radio', { name: 'Hebdo / mensuel' }).click()
  await expect(page.getByRole('heading', { name: 'Par semaine' })).toBeVisible()
  const weeks = await page.locator('thead th').count()
  expect(weeks).toBeGreaterThanOrEqual(6)
  await page.getByRole('radio', { name: 'Mois' }).click()
  await expect(page.getByRole('heading', { name: 'Par mois' })).toBeVisible()
  await expect(page.locator('tfoot td').last()).toHaveText(/\d+ h \d\d/)
})

test('custom range with no data shows an empty state', async ({ page }) => {
  await page.getByLabel('Du').fill('2020-01-01')
  await page.getByLabel('Au').fill('2020-01-31')
  await expect(page.getByText('Aucune entrée pour ces filtres.')).toBeVisible()
  await expect(page.getByLabel('Période')).toHaveValue('custom')
})

test('budgets and goals tab', async ({ page }) => {
  await page.getByRole('radio', { name: 'Budgets et objectifs' }).click()
  const card = page.locator('li').filter({ hasText: 'Migration Intune' })
  await expect(card.getByText(/\/ 10 j · \d+ %/)).toBeVisible()
  await expect(card.getByText(/Reste|Dépassé/)).toBeVisible()
})
