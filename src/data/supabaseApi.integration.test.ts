/**
 * Runs the Supabase data layer against a real Postgres + PostgREST started by
 * scripts/integration-env.sh, with the migrations and RLS applied.
 *   scripts/integration-env.sh start && npm run test:integration
 */
import { createClient } from '@supabase/supabase-js'
import { createHmac, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ProjectInput } from '../lib/types'
import { createSupabaseApi } from './supabaseApi'

const REST = process.env.INTEGRATION_REST_URL ?? 'http://localhost:54330'
const PG_PORT = process.env.PG_PORT ?? '54329'
const SECRET = 'kiwi-integration-secret-at-least-32-chars'

const b64 = (v: object | Buffer) => Buffer.from(v instanceof Buffer ? v : JSON.stringify(v)).toString('base64url')

function jwt(sub: string) {
  const head = b64({ alg: 'HS256', typ: 'JWT' })
  const body = b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })
  const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}

function sql(query: string) {
  return execFileSync('psql', ['-h', 'localhost', '-p', PG_PORT, '-U', 'postgres', '-d', 'kiwi', '-qtAc', query], { encoding: 'utf8' }).trim()
}

/** supabase-js talks to /rest/v1; a bare PostgREST serves from the root. */
const restFetch: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  return fetch(url.replace('/rest/v1', ''), init)
}

function apiFor(userId: string) {
  const client = createClient(REST, 'anon-key', {
    accessToken: async () => jwt(userId),
    global: { fetch: restFetch },
  })
  return createSupabaseApi(client, userId)
}

const project = (name: string, extra: Partial<ProjectInput> = {}): ProjectInput => ({
  name,
  categoryId: null,
  color: '#5E9B2E',
  archivedAt: null,
  budgetDays: null,
  goalAmount: null,
  goalUnit: null,
  goalPeriod: null,
  ...extra,
})

const alice = randomUUID()
const bob = randomUUID()
const carol = randomUUID()

beforeAll(() => {
  sql(`insert into auth.users (id, email, raw_user_meta_data) values
    ('${alice}', 'alice@example.com', '{"full_name":"Alice Martin"}'),
    ('${bob}', 'bob@example.com', '{"name":"Bob"}'),
    ('${carol}', 'carol@example.com', '{}')`)
})

describe('profile', () => {
  it('is created at sign-up with defaults and the account name', async () => {
    const profile = await apiFor(alice).getProfile()
    expect(profile).toMatchObject({
      id: alice,
      displayName: 'Alice Martin',
      onboarded: false,
      level1Label: 'Client',
      level2Label: 'Projet',
      locale: 'fr',
      theme: 'system',
      weekStart: 1,
      dayHours: 7,
      durationFormat: 'hm',
      roundingMinutes: 0,
      pomodoroWork: 25,
    })
    expect((await apiFor(bob).getProfile()).displayName).toBe('Bob')
  })

  it('is recreated if missing', async () => {
    sql(`delete from public.profiles where id = '${carol}'`)
    const profile = await apiFor(carol).getProfile()
    expect(profile.id).toBe(carol)
  })

  it('round-trips every preference', async () => {
    const api = apiFor(alice)
    const patch = {
      onboarded: true,
      level1Label: 'Matière',
      level1LabelPlural: 'Matières',
      level2Label: 'Sujet',
      level2LabelPlural: 'Sujets',
      locale: 'en' as const,
      theme: 'dark' as const,
      weekStart: 0 as const,
      dayHours: 7.5,
      durationFormat: 'decimal' as const,
      roundingMinutes: 15,
      roundingMode: 'up' as const,
      pomodoroWork: 50,
      pomodoroShortBreak: 10,
      pomodoroLongBreak: 30,
      pomodoroLongEvery: 3,
    }
    const updated = await api.updateProfile(patch)
    expect(updated).toMatchObject(patch)
    expect(await api.getProfile()).toMatchObject(patch)
  })

  it('rejects invalid values', async () => {
    await expect(apiFor(alice).updateProfile({ dayHours: 30 })).rejects.toThrow()
  })
})

describe('categories, projects and tags', () => {
  it('creates, updates, lists and deletes with targets', async () => {
    const api = apiFor(alice)
    const cat = await api.createCategory({
      name: 'ACME',
      color: '#2A78D6',
      archivedAt: null,
      budgetDays: 12.5,
      goalAmount: 2,
      goalUnit: 'days',
      goalPeriod: 'month',
    })
    expect(cat).toMatchObject({ name: 'ACME', budgetDays: 12.5, goalAmount: 2, goalUnit: 'days', goalPeriod: 'month' })

    const p = await api.createProject(project('Audit', { categoryId: cat.id, budgetDays: 4 }))
    expect(p.categoryId).toBe(cat.id)
    expect(p.budgetDays).toBe(4)

    const archivedAt = new Date().toISOString()
    const updated = await api.updateProject(p.id, { archivedAt, goalAmount: 5, goalUnit: 'hours', goalPeriod: 'week' })
    expect(updated.archivedAt).not.toBeNull()
    expect(updated).toMatchObject({ goalAmount: 5, goalUnit: 'hours', goalPeriod: 'week', name: 'Audit' })

    // Clearing a goal must clear all three fields together.
    const cleared = await api.updateProject(p.id, { goalAmount: null, goalUnit: null, goalPeriod: null })
    expect(cleared.goalAmount).toBeNull()

    expect((await api.listProjects()).map((x) => x.name)).toContain('Audit')

    // Deleting the category keeps its projects, detached.
    await api.deleteCategory(cat.id)
    expect((await api.listCategories()).find((c) => c.id === cat.id)).toBeUndefined()
    expect((await api.listProjects()).find((x) => x.id === p.id)?.categoryId).toBeNull()
  })

  it('rejects an incomplete goal', async () => {
    await expect(apiFor(alice).createProject(project('Bad goal', { goalAmount: 3 }))).rejects.toThrow()
  })

  it('manages tags, unique per user', async () => {
    const api = apiFor(alice)
    const tag = await api.createTag('réunion')
    await expect(api.createTag('réunion')).rejects.toThrow()
    // Another user can reuse the name.
    await expect(apiFor(bob).createTag('réunion')).resolves.toMatchObject({ name: 'réunion' })
    const renamed = await api.updateTag(tag.id, 'meeting')
    expect(renamed.name).toBe('meeting')
    await api.deleteTag(tag.id)
    expect((await api.listTags()).find((t) => t.id === tag.id)).toBeUndefined()
  })
})

describe('time entries and timer', () => {
  it('starts, switches and stops the timer', async () => {
    const api = apiFor(bob)
    const p = await api.createProject(project('Timer project'))
    const tag = await api.createTag('focus')

    const first = await api.startTimer({ projectId: p.id, description: 'first', tagIds: [tag.id] })
    expect(first).toMatchObject({ projectId: p.id, description: 'first', tagIds: [tag.id], end: null })
    expect((await api.getRunningEntry())?.id).toBe(first.id)

    const second = await api.startTimer({ projectId: null, description: 'second', tagIds: [] })
    const running = await api.getRunningEntry()
    expect(running?.id).toBe(second.id)
    const all = await api.listEntries(null)
    expect(all.find((e) => e.id === first.id)?.end).not.toBeNull()

    const stopped = await api.stopTimer(second.id)
    expect(stopped.end).not.toBeNull()
    expect(await api.getRunningEntry()).toBeNull()
  })

  it('creates, filters by range, updates and deletes entries', async () => {
    const api = apiFor(bob)
    const inside = await api.createEntry({
      projectId: null,
      description: 'inside',
      tagIds: [],
      start: '2026-03-10T09:00:00.000Z',
      end: '2026-03-10T10:30:00.000Z',
    })
    await api.createEntry({ projectId: null, description: 'outside', tagIds: [], start: '2026-04-10T09:00:00.000Z', end: '2026-04-10T10:00:00.000Z' })

    const march = await api.listEntries({ from: new Date('2026-03-01T00:00:00Z'), to: new Date('2026-03-31T23:59:59Z') })
    expect(march.map((e) => e.description)).toEqual(['inside'])
    expect(new Date(march[0].start).toISOString()).toBe('2026-03-10T09:00:00.000Z')

    const updated = await api.updateEntry(inside.id, { description: 'edited', end: '2026-03-10T11:00:00.000Z' })
    expect(updated.description).toBe('edited')
    expect(new Date(updated.end!).toISOString()).toBe('2026-03-10T11:00:00.000Z')

    await expect(api.updateEntry(inside.id, { end: '2026-03-10T08:00:00.000Z' })).rejects.toThrow()

    await api.deleteEntry(inside.id)
    expect((await api.listEntries(null)).find((e) => e.id === inside.id)).toBeUndefined()
  })

  it('removes a deleted tag from entries and keeps entries of a deleted project', async () => {
    const api = apiFor(bob)
    const p = await api.createProject(project('Temporary'))
    const tag = await api.createTag('temp')
    const e = await api.createEntry({ projectId: p.id, description: 'keep me', tagIds: [tag.id], start: '2026-02-01T09:00:00Z', end: '2026-02-01T10:00:00Z' })
    await api.deleteTag(tag.id)
    await api.deleteProject(p.id)
    const after = (await api.listEntries(null)).find((x) => x.id === e.id)
    expect(after).toMatchObject({ projectId: null, tagIds: [] })
  })

  it('pages through more than 1000 entries', async () => {
    sql(`insert into public.time_entries (user_id, description, start_at, end_at)
      select '${carol}', 'bulk ' || g, timestamptz '2025-01-01' + g * interval '1 hour', timestamptz '2025-01-01' + g * interval '1 hour' + interval '30 minutes'
      from generate_series(1, 2345) g`)
    const all = await apiFor(carol).listEntries(null)
    expect(all).toHaveLength(2345)
    expect(new Set(all.map((e) => e.id)).size).toBe(2345)
    // Newest first.
    expect(all[0].description).toBe('bulk 2345')
  })
})

describe('isolation between accounts', () => {
  it('never exposes or lets anyone modify another account', async () => {
    const aliceApi = apiFor(alice)
    const bobApi = apiFor(bob)
    const secret = await aliceApi.createProject(project('Alice only'))
    const entry = await aliceApi.createEntry({ projectId: secret.id, description: 'private', tagIds: [], start: '2026-01-05T09:00:00Z', end: '2026-01-05T10:00:00Z' })

    expect((await bobApi.listProjects()).find((p) => p.id === secret.id)).toBeUndefined()
    expect((await bobApi.listEntries(null)).find((e) => e.id === entry.id)).toBeUndefined()

    await expect(bobApi.updateEntry(entry.id, { description: 'hacked' })).rejects.toThrow()
    await expect(bobApi.createEntry({ projectId: secret.id, description: 'x', tagIds: [], start: '2026-01-05T09:00:00Z', end: '2026-01-05T10:00:00Z' })).rejects.toThrow()
    await bobApi.deleteProject(secret.id)
    expect((await aliceApi.listProjects()).find((p) => p.id === secret.id)).toBeDefined()
    expect(sql(`select description from public.time_entries where id = '${entry.id}'`)).toBe('private')
  })

  it('refuses anonymous access', async () => {
    const res = await fetch(`${REST}/time_entries?select=id`)
    const rows = (await res.json()) as unknown[]
    expect(Array.isArray(rows) ? rows.length : 0).toBe(0)
  })
})
