/**
 * The app built for Supabase, against Postgres + PostgREST with the real
 * migrations and RLS. Sign-in is simulated by storing a session signed with
 * the local JWT secret, the way supabase-js keeps it after an OAuth login.
 * Run with: scripts/integration-env.sh start && E2E_SUPABASE=1 npx playwright test --project supabase
 */
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { createHmac, randomUUID } from 'node:crypto'
import { descriptionInput, entryRow, pickProject, timerBar } from './helpers'

const SECRET = 'kiwi-integration-secret-at-least-32-chars'
const STORAGE_KEY = 'sb-localhost-auth-token'

function sql(query: string) {
  return execFileSync('psql', ['-h', 'localhost', '-p', process.env.PG_PORT ?? '54329', '-U', 'postgres', '-d', 'kiwi', '-qtAc', query], {
    encoding: 'utf8',
  }).trim()
}

function createUser(fullName: string) {
  const id = randomUUID()
  const email = `${id.slice(0, 8)}@example.com`
  sql(`insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${email}', '{"full_name": "${fullName}"}')`)
  return { id, email }
}

function session(user: { id: string; email: string }) {
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url')
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  const head = b64({ alg: 'HS256', typ: 'JWT' })
  const body = b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp: expiresAt })
  const token = `${head}.${body}.${createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`
  return JSON.stringify({
    access_token: token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: 'local-refresh-token',
    user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: { provider: 'google' }, user_metadata: {}, created_at: new Date().toISOString() },
  })
}

/** Completes onboarding and waits until the server has stored it. */
async function finishOnboarding(page: Page, user: { id: string }) {
  await page.getByRole('button', { name: 'C’est parti' }).click()
  await expect.poll(() => sql(`select onboarded from public.profiles where id = '${user.id}'`)).toBe('t')
}

async function signIn(page: Page, user: { id: string; email: string }) {
  await page.goto('/')
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, session(user)])
  await page.reload()
}

test('shows the login page and starts the OAuth flows', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Kiwi Time Tracker' })).toBeVisible()
  await page.getByRole('button', { name: 'Continuer avec Google' }).click()
  await page.waitForURL(/\/auth\/v1\/authorize/)
  expect(new URL(page.url()).searchParams.get('provider')).toBe('google')
  expect(new URL(page.url()).searchParams.get('redirect_to')).toBe('http://localhost:4175')

  await page.goto('/')
  await expect(page.getByRole('button', { name: /Microsoft/ })).toHaveCount(0)
})

test('a new account sets up its vocabulary and tracks time', async ({ page }) => {
  const user = createUser('Claire Dupont')
  await signIn(page, user)

  // First login: onboarding, as a student.
  await page.getByRole('button', { name: /Étudiant/ }).click()
  await page.getByRole('button', { name: 'C’est parti' }).click()
  await expect(page.getByRole('heading', { name: 'Bonjour Claire' })).toBeVisible()
  expect(sql(`select level2_label || '/' || onboarded from public.profiles where id = '${user.id}'`)).toBe('Sujet/true')

  // Subject and topic with a budget.
  await page.getByRole('link', { name: 'Sujets' }).click()
  await page.getByRole('radio', { name: 'Matières' }).click()
  await page.getByRole('button', { name: 'Ajouter : Matière' }).click()
  await page.getByRole('dialog').getByLabel('Nom').fill('Mathématiques')
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('Mathématiques')).toBeVisible()
  await page.getByRole('radio', { name: 'Sujets' }).click()
  await page.getByRole('button', { name: 'Ajouter : Sujet' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nom').fill('Algèbre')
  await dialog.getByLabel('Matière').selectOption({ label: 'Mathématiques' })
  await dialog.getByPlaceholder('10').fill('2')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('Algèbre')).toBeVisible()

  // Timer, kept by the server across reloads.
  await page.goto('/timer')
  await descriptionInput(page).fill('Exercices chapitre 3')
  await pickProject(page, timerBar(page).getByRole('button', { name: 'Choisir : Sujet' }), 'Algèbre')
  await timerBar(page).getByRole('button', { name: 'Démarrer le timer' }).click()
  await expect(timerBar(page).getByRole('button', { name: 'Arrêter le timer' })).toBeVisible()
  expect(sql(`select count(*) from public.time_entries where user_id = '${user.id}' and end_at is null`)).toBe('1')
  await page.reload()
  await expect(timerBar(page).getByRole('button', { name: 'Arrêter le timer' })).toBeVisible()
  await expect(descriptionInput(page)).toHaveValue('Exercices chapitre 3')
  await timerBar(page).getByRole('button', { name: 'Arrêter le timer' }).click()
  await expect(entryRow(page, 'Exercices chapitre 3')).toHaveCount(1)
  expect(sql(`select count(*) from public.time_entries where user_id = '${user.id}' and end_at is null`)).toBe('0')

  // Manual entry and edits.
  await timerBar(page).getByRole('button', { name: 'Saisie manuelle' }).click()
  await descriptionInput(page).fill('Révision')
  await timerBar(page).getByLabel('Début').fill('8')
  await timerBar(page).getByLabel('Fin').fill('10')
  await timerBar(page).getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(entryRow(page, 'Révision').getByRole('button', { name: '2 h 00' })).toBeVisible()
  await entryRow(page, 'Révision').getByRole('button', { name: '2 h 00' }).click()
  await page.getByRole('dialog').getByLabel('Durée').fill('3')
  await page.getByRole('dialog').getByLabel('Durée').blur()
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click()
  await expect(entryRow(page, 'Révision').getByRole('button', { name: '3 h 00' })).toBeVisible()

  // Timesheet writes to the server too.
  await page.goto('/timesheet')
  const row = page.locator('tbody tr').filter({ hasText: 'Algèbre' })
  await expect(row).toHaveCount(1)

  // Reports read it back.
  await page.goto('/reports?tab=detailed')
  await page.getByLabel('Période').selectOption({ label: 'Cette année' })
  await expect(page.getByText('2 entrées')).toBeVisible()

  // Settings are stored in the profile.
  await page.goto('/settings')
  await page.getByRole('radio', { name: 'Sombre' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect.poll(() => sql(`select theme from public.profiles where id = '${user.id}'`)).toBe('dark')
})

test('accounts never see each other', async ({ page }) => {
  const owner = createUser('Owner')
  sql(`insert into public.projects (user_id, name) values ('${owner.id}', 'Projet confidentiel')`)
  const other = createUser('Other')
  await signIn(page, other)
  await finishOnboarding(page, other)
  await page.goto('/projects')
  await expect(page.getByText('Rien ici pour l’instant.')).toBeVisible()
  await expect(page.getByText('Projet confidentiel')).toHaveCount(0)
})

test('explains when the server cannot be reached', async ({ page }) => {
  const user = createUser('Offline')
  await signIn(page, user)
  await finishOnboarding(page, user)
  await page.goto('/timer')
  await page.route('**/rest/v1/**', (route) => route.abort())
  await descriptionInput(page).fill('Hors ligne')
  await timerBar(page).getByRole('button', { name: 'Démarrer le timer' }).click()
  await expect(page.getByText('Connexion impossible. Vérifie ton réseau et réessaie.')).toBeVisible()
  await page.unroute('**/rest/v1/**')
})

test('signs out', async ({ page }) => {
  const user = createUser('Leaving')
  await signIn(page, user)
  await finishOnboarding(page, user)
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(page.getByRole('button', { name: 'Continuer avec Google' })).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
})
