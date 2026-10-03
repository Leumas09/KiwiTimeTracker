import type { Category, Project, Tag, TimeEntry } from './types'

/** A past activity that can be reused: description, project and tags. */
export interface Activity {
  description: string
  projectId: string | null
  tagIds: string[]
  lastUsed: string
  count: number
}

/** Lowercase, without accents, for forgiving matches ("reunion" finds "Réunion"). */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Unique activities, most recently used first. */
export function recentActivities(entries: TimeEntry[]): Activity[] {
  const byKey = new Map<string, Activity>()
  for (const e of entries) {
    if (!e.description.trim() && !e.projectId) continue
    const key = `${e.description.trim().toLowerCase()}|${e.projectId ?? ''}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, { description: e.description.trim(), projectId: e.projectId, tagIds: e.tagIds, lastUsed: e.start, count: 1 })
    } else {
      existing.count++
      if (e.start > existing.lastUsed) {
        existing.lastUsed = e.start
        existing.tagIds = e.tagIds
      }
    }
  }
  return [...byKey.values()].sort((a, b) => b.lastUsed.localeCompare(a.lastUsed))
}

/**
 * Activities matching every word of the query, in the description, the
 * project or its category. Matches at the start of the description rank first.
 */
export function searchActivities(
  activities: Activity[],
  query: string,
  projects: Map<string, Project>,
  categories: Map<string, Category>,
  limit = 8,
): Activity[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (!words.length) return activities.slice(0, limit)
  const scored: { activity: Activity; score: number }[] = []
  for (const a of activities) {
    const project = a.projectId ? projects.get(a.projectId) : undefined
    const category = project?.categoryId ? categories.get(project.categoryId) : undefined
    const description = normalize(a.description)
    const haystack = `${description} ${normalize(project?.name ?? '')} ${normalize(category?.name ?? '')}`
    if (!words.every((w) => haystack.includes(w))) continue
    const score = (description.startsWith(words[0]) ? 2 : 0) + (description.includes(words.join(' ')) ? 1 : 0)
    scored.push({ activity: a, score })
  }
  return scored
    .sort((x, y) => y.score - x.score || y.activity.lastUsed.localeCompare(x.activity.lastUsed))
    .slice(0, limit)
    .map((s) => s.activity)
}

/** The @project or #tag token being typed at the caret, if any. */
export interface Token {
  kind: '@' | '#'
  query: string
  start: number
  end: number
}

export function tokenAt(text: string, caret: number): Token | null {
  const before = text.slice(0, caret)
  // The query may contain spaces ("@Projet tout neuf"); it stops at another @ or #.
  const match = before.match(/(^|\s)([@#])([^@#]*)$/)
  if (!match || /^\s/.test(match[3])) return null
  const start = caret - match[3].length - 1
  return { kind: match[2] as '@' | '#', query: match[3], start, end: caret }
}

/** Removes a token from the text and tidies the spaces around it. */
export function removeToken(text: string, token: Token): string {
  return (text.slice(0, token.start) + text.slice(token.end)).replace(/\s{2,}/g, ' ').trim()
}

export function searchProjects(
  projects: Project[],
  categories: Map<string, Category>,
  query: string,
  limit = 8,
): Project[] {
  const q = normalize(query)
  return projects
    .filter((p) => !p.archivedAt)
    .filter((p) => !q || normalize(p.name).includes(q) || normalize(categories.get(p.categoryId ?? '')?.name ?? '').includes(q))
    .sort((a, b) => Number(normalize(b.name).startsWith(q)) - Number(normalize(a.name).startsWith(q)) || a.name.localeCompare(b.name))
    .slice(0, limit)
}

export function searchTags(tags: Tag[], query: string, exclude: string[], limit = 8): Tag[] {
  const q = normalize(query)
  return tags
    .filter((t) => !exclude.includes(t.id) && (!q || normalize(t.name).includes(q)))
    .sort((a, b) => Number(normalize(b.name).startsWith(q)) - Number(normalize(a.name).startsWith(q)) || a.name.localeCompare(b.name))
    .slice(0, limit)
}
