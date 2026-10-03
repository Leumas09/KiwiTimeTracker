import { expect, test } from './fixtures'
import { descriptionInput, entryRow, openApp, timerBar } from './helpers'

test('runs a full Pomodoro cycle', async ({ page, context }) => {
  test.slow()
  await context.grantPermissions(['notifications'])
  await openApp(page, 'Pro', '/settings')
  await page.getByLabel('Travail').fill('1')
  await page.getByLabel('Travail').press('Enter')
  await page.getByLabel('Petite pause').fill('1')
  await page.getByLabel('Petite pause').press('Enter')

  await page.goto('/timer')
  await descriptionInput(page).fill('Pomodoro')
  await timerBar(page).getByRole('button', { name: 'Démarrer un pomodoro' }).click()
  await expect(timerBar(page).getByRole('button', { name: 'Arrêter le timer' })).toBeVisible()
  await expect(timerBar(page).getByText(/^\s*0?0:\d\d$/)).toBeVisible()

  // The cycle survives a reload.
  await page.reload()
  await expect(timerBar(page).getByRole('button', { name: 'Arrêter le timer' })).toBeVisible()

  // Work phase ends: the timer stops at exactly one minute and a break starts.
  await expect(page.getByText(/Petite pause ·/)).toBeVisible({ timeout: 70_000 })
  await expect(timerBar(page).getByRole('button', { name: 'Démarrer le timer' })).toBeVisible()
  await expect(entryRow(page, 'Pomodoro').getByRole('button', { name: '1 min' })).toBeVisible()

  await page.getByRole('button', { name: 'Passer la pause' }).click()
  await expect(page.getByText('Pause terminée · 1 pomodoro fait')).toBeVisible()
  await page.getByRole('button', { name: 'Pomodoro suivant' }).click()
  await expect(timerBar(page).getByRole('button', { name: 'Arrêter le timer' })).toBeVisible()
  await expect(descriptionInput(page)).toHaveValue('Pomodoro')

  // Stopping the timer ends the cycle.
  await timerBar(page).getByRole('button', { name: 'Arrêter le timer' }).click()
  await expect(page.getByText(/pause|Pomodoro suivant/i)).toHaveCount(0)
})
