export type Locale = 'fr' | 'en'
export type ThemePref = 'system' | 'light' | 'dark'
export type DurationFormat = 'hm' | 'decimal' | 'clock'
export type RoundingMode = 'nearest' | 'up' | 'down'
export type GoalUnit = 'hours' | 'days'
export type GoalPeriod = 'week' | 'month'

export interface Profile {
  id: string
  displayName: string
  onboarded: boolean
  level1Label: string
  level1LabelPlural: string
  level2Label: string
  level2LabelPlural: string
  locale: Locale
  theme: ThemePref
  weekStart: 0 | 1
  dayHours: number
  durationFormat: DurationFormat
  roundingMinutes: number
  roundingMode: RoundingMode
  pomodoroWork: number
  pomodoroShortBreak: number
  pomodoroLongBreak: number
  pomodoroLongEvery: number
}

/** Budget (in days) and recurring goal, shared by both levels. */
export interface Targets {
  budgetDays: number | null
  goalAmount: number | null
  goalUnit: GoalUnit | null
  goalPeriod: GoalPeriod | null
}

/** Level 1: Client, Matière… */
export interface Category extends Targets {
  id: string
  name: string
  color: string
  archivedAt: string | null
  createdAt: string
}

/** Level 2: Projet, Sujet… */
export interface Project extends Targets {
  id: string
  categoryId: string | null
  name: string
  color: string
  archivedAt: string | null
  createdAt: string
}

export interface Tag {
  id: string
  name: string
}

export interface TimeEntry {
  id: string
  projectId: string | null
  description: string
  tagIds: string[]
  /** ISO timestamp */
  start: string
  /** ISO timestamp, null while the timer runs */
  end: string | null
}

export type NewEntry = Omit<TimeEntry, 'id'>
export type EntryPatch = Partial<NewEntry>
export type CategoryInput = Omit<Category, 'id' | 'createdAt'>
export type ProjectInput = Omit<Project, 'id' | 'createdAt'>

export interface DateRange {
  from: Date
  to: Date
}
