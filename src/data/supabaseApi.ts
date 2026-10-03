import type { SupabaseClient } from '@supabase/supabase-js'
import type { Category, CategoryInput, EntryPatch, Profile, Project, ProjectInput, Tag, TimeEntry } from '../lib/types'
import type { DataApi, Table } from './api'

type Row = Record<string, unknown>

const PAGE = 1000

const toProfile = (r: Row): Profile => ({
  id: r.id as string,
  displayName: r.display_name as string,
  onboarded: r.onboarded as boolean,
  level1Label: r.level1_label as string,
  level1LabelPlural: r.level1_label_plural as string,
  level2Label: r.level2_label as string,
  level2LabelPlural: r.level2_label_plural as string,
  locale: r.locale as Profile['locale'],
  theme: r.theme as Profile['theme'],
  weekStart: r.week_start as Profile['weekStart'],
  dayHours: Number(r.day_hours),
  durationFormat: r.duration_format as Profile['durationFormat'],
  roundingMinutes: r.rounding_minutes as number,
  roundingMode: r.rounding_mode as Profile['roundingMode'],
  pomodoroWork: r.pomodoro_work as number,
  pomodoroShortBreak: r.pomodoro_short_break as number,
  pomodoroLongBreak: r.pomodoro_long_break as number,
  pomodoroLongEvery: r.pomodoro_long_every as number,
})

const profileColumns: Record<keyof Omit<Profile, 'id'>, string> = {
  displayName: 'display_name',
  onboarded: 'onboarded',
  level1Label: 'level1_label',
  level1LabelPlural: 'level1_label_plural',
  level2Label: 'level2_label',
  level2LabelPlural: 'level2_label_plural',
  locale: 'locale',
  theme: 'theme',
  weekStart: 'week_start',
  dayHours: 'day_hours',
  durationFormat: 'duration_format',
  roundingMinutes: 'rounding_minutes',
  roundingMode: 'rounding_mode',
  pomodoroWork: 'pomodoro_work',
  pomodoroShortBreak: 'pomodoro_short_break',
  pomodoroLongBreak: 'pomodoro_long_break',
  pomodoroLongEvery: 'pomodoro_long_every',
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

const toTargets = (r: Row) => ({
  budgetDays: num(r.budget_days),
  goalAmount: num(r.goal_amount),
  goalUnit: (r.goal_unit as Category['goalUnit']) ?? null,
  goalPeriod: (r.goal_period as Category['goalPeriod']) ?? null,
})

const toCategory = (r: Row): Category => ({
  id: r.id as string,
  name: r.name as string,
  color: r.color as string,
  archivedAt: (r.archived_at as string) ?? null,
  createdAt: r.created_at as string,
  ...toTargets(r),
})

const toProject = (r: Row): Project => ({
  id: r.id as string,
  categoryId: (r.category_id as string) ?? null,
  name: r.name as string,
  color: r.color as string,
  archivedAt: (r.archived_at as string) ?? null,
  createdAt: r.created_at as string,
  ...toTargets(r),
})

const toEntry = (r: Row): TimeEntry => ({
  id: r.id as string,
  projectId: (r.project_id as string) ?? null,
  description: r.description as string,
  tagIds: (r.tag_ids as string[]) ?? [],
  start: r.start_at as string,
  end: (r.end_at as string) ?? null,
})

function fromTargets(patch: Partial<CategoryInput>): Row {
  const row: Row = {}
  if ('name' in patch) row.name = patch.name
  if ('color' in patch) row.color = patch.color
  if ('archivedAt' in patch) row.archived_at = patch.archivedAt
  if ('budgetDays' in patch) row.budget_days = patch.budgetDays
  if ('goalAmount' in patch) row.goal_amount = patch.goalAmount
  if ('goalUnit' in patch) row.goal_unit = patch.goalUnit
  if ('goalPeriod' in patch) row.goal_period = patch.goalPeriod
  return row
}

function fromProject(patch: Partial<ProjectInput>): Row {
  const row = fromTargets(patch)
  if ('categoryId' in patch) row.category_id = patch.categoryId
  return row
}

function fromEntry(patch: EntryPatch): Row {
  const row: Row = {}
  if ('projectId' in patch) row.project_id = patch.projectId
  if ('description' in patch) row.description = patch.description
  if ('tagIds' in patch) row.tag_ids = patch.tagIds
  if ('start' in patch) row.start_at = patch.start
  if ('end' in patch) row.end_at = patch.end
  return row
}

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data as T
}

export function createSupabaseApi(client: SupabaseClient, userId: string): DataApi {
  return {
    async getProfile() {
      const existing = check(await client.from('profiles').select('*').eq('id', userId).maybeSingle())
      if (existing) return toProfile(existing)
      // The auth trigger normally creates it; this covers users created before the migration.
      return toProfile(check(await client.from('profiles').insert({ id: userId }).select().single()))
    },
    async updateProfile(patch) {
      const row: Row = {}
      for (const [key, value] of Object.entries(patch)) row[profileColumns[key as keyof typeof profileColumns]] = value
      return toProfile(check(await client.from('profiles').update(row).eq('id', userId).select().single()))
    },

    async listCategories() {
      return check(await client.from('categories').select('*').order('name')).map(toCategory)
    },
    async createCategory(input) {
      return toCategory(check(await client.from('categories').insert(fromTargets(input)).select().single()))
    },
    async updateCategory(id, patch) {
      return toCategory(check(await client.from('categories').update(fromTargets(patch)).eq('id', id).select().single()))
    },
    async deleteCategory(id) {
      check(await client.from('categories').delete().eq('id', id))
    },

    async listProjects() {
      return check(await client.from('projects').select('*').order('name')).map(toProject)
    },
    async createProject(input) {
      return toProject(check(await client.from('projects').insert(fromProject(input)).select().single()))
    },
    async updateProject(id, patch) {
      return toProject(check(await client.from('projects').update(fromProject(patch)).eq('id', id).select().single()))
    },
    async deleteProject(id) {
      check(await client.from('projects').delete().eq('id', id))
    },

    async listTags() {
      return check(await client.from('tags').select('id, name').order('name')) as Tag[]
    },
    async createTag(name) {
      return check(await client.from('tags').insert({ name }).select('id, name').single()) as Tag
    },
    async updateTag(id, name) {
      return check(await client.from('tags').update({ name }).eq('id', id).select('id, name').single()) as Tag
    },
    async deleteTag(id) {
      check(await client.from('tags').delete().eq('id', id))
    },

    async listEntries(range) {
      const rows: Row[] = []
      for (let offset = 0; ; offset += PAGE) {
        let query = client.from('time_entries').select('*')
        if (range) query = query.gte('start_at', range.from.toISOString()).lte('start_at', range.to.toISOString())
        const page = check(await query.order('start_at', { ascending: false }).order('id').range(offset, offset + PAGE - 1))
        rows.push(...page)
        if (page.length < PAGE) break
      }
      return rows.map(toEntry)
    },
    async getRunningEntry() {
      const row = check(await client.from('time_entries').select('*').is('end_at', null).maybeSingle())
      return row ? toEntry(row) : null
    },
    async createEntry(input) {
      return toEntry(check(await client.from('time_entries').insert(fromEntry(input)).select().single()))
    },
    async updateEntry(id, patch) {
      return toEntry(check(await client.from('time_entries').update(fromEntry(patch)).eq('id', id).select().single()))
    },
    async deleteEntry(id) {
      check(await client.from('time_entries').delete().eq('id', id))
    },
    async startTimer({ projectId, description, tagIds, start }) {
      const row = check(
        await client.rpc('start_timer', {
          p_project_id: projectId,
          p_description: description,
          p_tag_ids: tagIds,
          p_start_at: (start ?? new Date()).toISOString(),
        }),
      )
      return toEntry(row as Row)
    },
    async stopTimer(id, end) {
      return this.updateEntry(id, { end: (end ?? new Date()).toISOString() })
    },

    subscribe(onChange) {
      const tables: Table[] = ['profiles', 'categories', 'projects', 'tags', 'time_entries']
      const channel = client.channel(`kiwi-${userId}`)
      // No row filter: Realtime already applies RLS to inserts and updates,
      // and delete events cannot be filtered anyway.
      for (const table of tables) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange(table))
      }
      channel.subscribe()
      return () => {
        client.removeChannel(channel)
      }
    },
  }
}
