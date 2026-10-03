import { differenceInCalendarDays, endOfMonth, endOfWeek, startOfMonth, startOfWeek, subDays } from 'date-fns'
import { dayKey } from './dates'
import { roundSeconds } from './duration'
import type { Category, DateRange, GoalPeriod, Profile, Project, Tag, Targets, TimeEntry } from './types'

export const NONE = '__none__'

export function entrySeconds(entry: TimeEntry, now = Date.now()): number {
  const start = new Date(entry.start).getTime()
  const end = entry.end ? new Date(entry.end).getTime() : now
  return Math.max(0, (end - start) / 1000)
}

type Rounding = Pick<Profile, 'roundingMinutes' | 'roundingMode'>

/** Duration used by reports, dashboard and budgets: rounded per entry. */
export function reportSeconds(entry: TimeEntry, rounding: Rounding, now = Date.now()): number {
  return roundSeconds(entrySeconds(entry, now), rounding.roundingMinutes, rounding.roundingMode)
}

export function sumSeconds(entries: TimeEntry[], rounding?: Rounding, now = Date.now()): number {
  return entries.reduce((acc, e) => acc + (rounding ? reportSeconds(e, rounding, now) : entrySeconds(e, now)), 0)
}

export interface EntryFilters {
  categoryIds: string[]
  projectIds: string[]
  tagIds: string[]
  text: string
}

export const EMPTY_FILTERS: EntryFilters = { categoryIds: [], projectIds: [], tagIds: [], text: '' }

/** Filter values may contain NONE to match entries without a project/category/tag. */
export function filterEntries(entries: TimeEntry[], filters: EntryFilters, projects: Map<string, Project>): TimeEntry[] {
  const text = filters.text.trim().toLowerCase()
  return entries.filter((e) => {
    const project = e.projectId ? projects.get(e.projectId) : undefined
    if (filters.projectIds.length && !filters.projectIds.includes(e.projectId ?? NONE)) return false
    if (filters.categoryIds.length && !filters.categoryIds.includes(project?.categoryId ?? NONE)) return false
    if (filters.tagIds.length) {
      const tags = e.tagIds.length ? e.tagIds : [NONE]
      if (!tags.some((t) => filters.tagIds.includes(t))) return false
    }
    if (text && !e.description.toLowerCase().includes(text)) return false
    return true
  })
}

export function inRange(entry: TimeEntry, range: DateRange): boolean {
  const start = new Date(entry.start)
  return start >= range.from && start <= range.to
}

export type Dimension = 'category' | 'project' | 'tag'

export interface Lookup {
  categories: Map<string, Category>
  projects: Map<string, Project>
  tags: Map<string, Tag>
}

export function buildLookup(categories: Category[], projects: Project[], tags: Tag[]): Lookup {
  return {
    categories: new Map(categories.map((c) => [c.id, c])),
    projects: new Map(projects.map((p) => [p.id, p])),
    tags: new Map(tags.map((t) => [t.id, t])),
  }
}

/** Keys an entry belongs to for a dimension. Tags: one key per tag. */
export function entryKeys(entry: TimeEntry, dimension: Dimension, lookup: Lookup): string[] {
  if (dimension === 'project') return [entry.projectId ?? NONE]
  if (dimension === 'category') {
    const project = entry.projectId ? lookup.projects.get(entry.projectId) : undefined
    return [project?.categoryId ?? NONE]
  }
  return entry.tagIds.length ? entry.tagIds : [NONE]
}

export interface GroupTotal {
  key: string
  seconds: number
}

export function totalsBy(entries: TimeEntry[], dimension: Dimension, lookup: Lookup, rounding: Rounding, now = Date.now()): GroupTotal[] {
  const totals = new Map<string, number>()
  for (const e of entries) {
    const s = reportSeconds(e, rounding, now)
    for (const k of entryKeys(e, dimension, lookup)) totals.set(k, (totals.get(k) ?? 0) + s)
  }
  return [...totals.entries()].map(([key, seconds]) => ({ key, seconds })).sort((a, b) => b.seconds - a.seconds)
}

export type Bucket = 'day' | 'week' | 'month'

export function bucketKey(date: Date, bucket: Bucket, weekStartsOn: 0 | 1): string {
  if (bucket === 'day') return dayKey(date)
  if (bucket === 'week') return dayKey(startOfWeek(date, { weekStartsOn }))
  return dayKey(startOfMonth(date))
}

export function pickBucket(range: DateRange): Bucket {
  const days = differenceInCalendarDays(range.to, range.from) + 1
  if (days <= 35) return 'day'
  if (days <= 190) return 'week'
  return 'month'
}

/** Matrix: bucket -> group key -> seconds. */
export function matrix(
  entries: TimeEntry[],
  bucket: Bucket,
  dimension: Dimension,
  lookup: Lookup,
  profile: Rounding & { weekStart: 0 | 1 },
  now = Date.now(),
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  for (const e of entries) {
    const b = bucketKey(new Date(e.start), bucket, profile.weekStart)
    const row = out.get(b) ?? new Map<string, number>()
    const s = reportSeconds(e, profile, now)
    for (const k of entryKeys(e, dimension, lookup)) row.set(k, (row.get(k) ?? 0) + s)
    out.set(b, row)
  }
  return out
}

// ---------------------------------------------------------------------------
// Budgets and goals
// ---------------------------------------------------------------------------

export function budgetSeconds(target: Targets, dayHours: number): number | null {
  return target.budgetDays ? target.budgetDays * dayHours * 3600 : null
}

export function goalSeconds(target: Targets, dayHours: number): number | null {
  if (!target.goalAmount || !target.goalUnit) return null
  return target.goalAmount * (target.goalUnit === 'days' ? dayHours : 1) * 3600
}

export function periodRange(period: GoalPeriod, date: Date, weekStartsOn: 0 | 1): DateRange {
  return period === 'week'
    ? { from: startOfWeek(date, { weekStartsOn }), to: endOfWeek(date, { weekStartsOn }) }
    : { from: startOfMonth(date), to: endOfMonth(date) }
}

export type Level = 'ok' | 'warning' | 'over'

export function budgetLevel(ratio: number): Level {
  if (ratio >= 1) return 'over'
  if (ratio >= 0.8) return 'warning'
  return 'ok'
}

/**
 * Estimated date the budget runs out, from the pace of the last 28 days.
 * Null when there is no recent activity or the budget is already spent.
 */
export function projectExhaustion(
  entries: TimeEntry[],
  remainingSeconds: number,
  rounding: Rounding,
  now = new Date(),
): Date | null {
  if (remainingSeconds <= 0) return null
  const window = { from: subDays(now, 28), to: now }
  const recent = sumSeconds(entries.filter((e) => inRange(e, window)), rounding, now.getTime())
  if (recent <= 0) return null
  const perDay = recent / 28
  return new Date(now.getTime() + (remainingSeconds / perDay) * 86400 * 1000)
}

/** Entries that count for a target: a project's own, or all projects of a category. */
export function entriesForTarget(
  entries: TimeEntry[],
  kind: 'category' | 'project',
  id: string,
  projects: Map<string, Project>,
): TimeEntry[] {
  if (kind === 'project') return entries.filter((e) => e.projectId === id)
  return entries.filter((e) => e.projectId && projects.get(e.projectId)?.categoryId === id)
}
