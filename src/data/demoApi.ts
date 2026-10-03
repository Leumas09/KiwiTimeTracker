import { addMinutes, setHours, setMinutes, startOfDay, subDays } from 'date-fns'
import { PALETTE } from '../lib/colors'
import type { Category, Profile, Project, Tag, TimeEntry } from '../lib/types'
import type { DataApi, Table } from './api'

/**
 * Local demo backend: same contract as Supabase, data kept in localStorage.
 * Used when no Supabase project is configured, so the app can be tried as is.
 */

interface Store {
  profile: Profile
  categories: Category[]
  projects: Project[]
  tags: Tag[]
  entries: TimeEntry[]
}

const KEY = 'kiwi-demo-store-v1'
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000000'

const uuid = () => crypto.randomUUID()
const noTargets = { budgetDays: null, goalAmount: null, goalUnit: null, goalPeriod: null }

export const defaultProfile = (id: string): Profile => ({
  id,
  displayName: '',
  onboarded: false,
  level1Label: 'Client',
  level1LabelPlural: 'Clients',
  level2Label: 'Projet',
  level2LabelPlural: 'Projets',
  locale: 'fr',
  theme: 'system',
  weekStart: 1,
  dayHours: 7,
  durationFormat: 'hm',
  roundingMinutes: 0,
  roundingMode: 'nearest',
  pomodoroWork: 25,
  pomodoroShortBreak: 5,
  pomodoroLongBreak: 15,
  pomodoroLongEvery: 4,
})

function seed(): Store {
  const now = new Date()
  const created = subDays(now, 60).toISOString()
  const acme: Category = { id: uuid(), name: 'ACME Industries', color: PALETTE[0].light, archivedAt: null, createdAt: created, ...noTargets }
  const gptw: Category = { id: uuid(), name: 'Great Place', color: PALETTE[3].light, archivedAt: null, createdAt: created, ...noTargets, goalAmount: 2, goalUnit: 'days', goalPeriod: 'month' }
  const internal: Category = { id: uuid(), name: 'Kiwi Consulting', color: PALETTE[6].light, archivedAt: null, createdAt: created, ...noTargets }
  const p = (name: string, cat: Category, color: string, extra: Partial<Project> = {}): Project => ({
    id: uuid(), categoryId: cat.id, name, color, archivedAt: null, createdAt: created, ...noTargets, ...extra,
  })
  const projects = [
    p('Migration Intune', acme, PALETTE[0].light, { budgetDays: 10 }),
    p('Audit sécurité', acme, PALETTE[2].light, { budgetDays: 4 }),
    p('Accès conditionnel', gptw, PALETTE[3].light),
    p('Formation MFA', gptw, PALETTE[5].light, { goalAmount: 3, goalUnit: 'hours', goalPeriod: 'week' }),
    p('Administratif', internal, PALETTE[6].light),
    p('Veille', internal, PALETTE[1].light),
  ]
  const tags: Tag[] = ['réunion', 'atelier', 'documentation', 'support'].map((name) => ({ id: uuid(), name }))
  const descriptions: Record<string, string[]> = {
    'Migration Intune': ['Préparation des profils de configuration', 'Pilote groupe IT', 'Point hebdo projet'],
    'Audit sécurité': ['Revue des comptes à privilèges', 'Rédaction du rapport'],
    'Accès conditionnel': ['Mode report-only', 'Atelier politique MFA', 'Analyse des sign-in logs'],
    'Formation MFA': ['Support de formation', 'Session utilisateurs'],
    Administratif: ['Facturation', 'Emails'],
    Veille: ['Lecture Microsoft Learn'],
  }

  // Deterministic pseudo-random so the demo looks the same on each reset.
  let s = 42
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647)

  const entries: TimeEntry[] = []
  for (let d = 27; d >= 0; d--) {
    const day = startOfDay(subDays(now, d))
    if (day.getDay() === 0 || day.getDay() === 6) continue
    let cursor = setMinutes(setHours(day, 8), 30 + Math.floor(rand() * 4) * 15)
    const blocks = 3 + Math.floor(rand() * 3)
    for (let b = 0; b < blocks; b++) {
      const project = projects[Math.floor(rand() * projects.length)]
      const minutes = 30 + Math.floor(rand() * 8) * 15
      const end = addMinutes(cursor, minutes)
      if (end > now) break
      const options = descriptions[project.name]
      entries.push({
        id: uuid(),
        projectId: project.id,
        description: options[Math.floor(rand() * options.length)],
        tagIds: rand() > 0.6 ? [tags[Math.floor(rand() * tags.length)].id] : [],
        start: cursor.toISOString(),
        end: end.toISOString(),
      })
      cursor = addMinutes(end, b === 1 ? 60 : 15)
    }
  }
  entries.sort((a, b) => b.start.localeCompare(a.start))

  return {
    profile: { ...defaultProfile(DEMO_USER_ID), displayName: 'Démo' },
    categories: [acme, gptw, internal],
    projects,
    tags,
    entries,
  }
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Store
  } catch {
    // Storage unavailable or corrupted: start over.
  }
  const store = seed()
  save(store)
  return store
}

function save(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // Private mode: the demo still works for this session.
  }
}

export function resetDemo() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

const clone = <T>(v: T): T => structuredClone(v)
const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name)

export function createDemoApi(): DataApi {
  let store = load()
  const listeners = new Set<(table: Table) => void>()
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('kiwi-demo') : null

  channel?.addEventListener('message', (event: MessageEvent<Table>) => {
    store = load()
    listeners.forEach((l) => l(event.data))
  })

  function commit(table: Table) {
    save(store)
    channel?.postMessage(table)
  }

  function find<T extends { id: string }>(list: T[], id: string): T {
    const item = list.find((x) => x.id === id)
    if (!item) throw new Error('Not found')
    return item
  }

  const api: DataApi = {
    async getProfile() {
      return clone(store.profile)
    },
    async updateProfile(patch) {
      store.profile = { ...store.profile, ...patch }
      commit('profiles')
      return clone(store.profile)
    },

    async listCategories() {
      return clone(store.categories).sort(byName)
    },
    async createCategory(input) {
      const c: Category = { ...input, id: uuid(), createdAt: new Date().toISOString() }
      store.categories.push(c)
      commit('categories')
      return clone(c)
    },
    async updateCategory(id, patch) {
      Object.assign(find(store.categories, id), patch)
      commit('categories')
      return clone(find(store.categories, id))
    },
    async deleteCategory(id) {
      store.categories = store.categories.filter((c) => c.id !== id)
      store.projects.forEach((p) => {
        if (p.categoryId === id) p.categoryId = null
      })
      commit('categories')
    },

    async listProjects() {
      return clone(store.projects).sort(byName)
    },
    async createProject(input) {
      const p: Project = { ...input, id: uuid(), createdAt: new Date().toISOString() }
      store.projects.push(p)
      commit('projects')
      return clone(p)
    },
    async updateProject(id, patch) {
      Object.assign(find(store.projects, id), patch)
      commit('projects')
      return clone(find(store.projects, id))
    },
    async deleteProject(id) {
      store.projects = store.projects.filter((p) => p.id !== id)
      store.entries.forEach((e) => {
        if (e.projectId === id) e.projectId = null
      })
      commit('projects')
    },

    async listTags() {
      return clone(store.tags).sort(byName)
    },
    async createTag(name) {
      if (store.tags.some((t) => t.name === name)) throw new Error('duplicate key value violates unique constraint')
      const t: Tag = { id: uuid(), name }
      store.tags.push(t)
      commit('tags')
      return clone(t)
    },
    async updateTag(id, name) {
      find(store.tags, id).name = name
      commit('tags')
      return clone(find(store.tags, id))
    },
    async deleteTag(id) {
      store.tags = store.tags.filter((t) => t.id !== id)
      store.entries.forEach((e) => {
        e.tagIds = e.tagIds.filter((t) => t !== id)
      })
      commit('tags')
    },

    async listEntries(range) {
      const from = range?.from.toISOString()
      const to = range?.to.toISOString()
      return clone(store.entries)
        .filter((e) => !range || (new Date(e.start).toISOString() >= from! && new Date(e.start).toISOString() <= to!))
        .sort((a, b) => b.start.localeCompare(a.start))
    },
    async getRunningEntry() {
      const running = store.entries.find((e) => e.end === null)
      return running ? clone(running) : null
    },
    async createEntry(input) {
      if (input.end === null && store.entries.some((e) => e.end === null)) throw new Error('A timer is already running')
      const e: TimeEntry = { ...input, id: uuid() }
      store.entries.push(e)
      commit('time_entries')
      return clone(e)
    },
    async updateEntry(id, patch) {
      const e = find(store.entries, id)
      const next = { ...e, ...patch }
      if (next.end && next.end < next.start) throw new Error('End must be after start')
      Object.assign(e, patch)
      commit('time_entries')
      return clone(e)
    },
    async deleteEntry(id) {
      store.entries = store.entries.filter((e) => e.id !== id)
      commit('time_entries')
    },
    async startTimer({ projectId, description, tagIds, start }) {
      const at = (start ?? new Date()).toISOString()
      store.entries.forEach((e) => {
        if (e.end === null) e.end = at > e.start ? at : e.start
      })
      const e: TimeEntry = { id: uuid(), projectId, description, tagIds, start: at, end: null }
      store.entries.push(e)
      commit('time_entries')
      return clone(e)
    },
    async stopTimer(id, end) {
      return api.updateEntry(id, { end: (end ?? new Date()).toISOString() })
    },

    subscribe(onChange) {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
  }
  return api
}
