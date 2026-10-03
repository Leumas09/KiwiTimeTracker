import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns'
import { enUS, fr } from 'date-fns/locale'
import type { DateRange, Locale } from './types'

export const dateLocale = (locale: Locale) => (locale === 'fr' ? fr : enUS)

export const dayKey = (date: Date | string) => format(typeof date === 'string' ? new Date(date) : date, 'yyyy-MM-dd')

export const fromDayKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export type RangePreset =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'last30'
  | 'thisYear'

export const RANGE_PRESETS: RangePreset[] = [
  'today',
  'yesterday',
  'thisWeek',
  'lastWeek',
  'thisMonth',
  'lastMonth',
  'last30',
  'thisYear',
]

export function presetRange(preset: RangePreset, weekStartsOn: 0 | 1, now = new Date()): DateRange {
  const week = { weekStartsOn }
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) }
    case 'yesterday': {
      const y = subDays(now, 1)
      return { from: startOfDay(y), to: endOfDay(y) }
    }
    case 'thisWeek':
      return { from: startOfWeek(now, week), to: endOfWeek(now, week) }
    case 'lastWeek': {
      const w = subWeeks(now, 1)
      return { from: startOfWeek(w, week), to: endOfWeek(w, week) }
    }
    case 'thisMonth':
      return { from: startOfMonth(now), to: endOfMonth(now) }
    case 'lastMonth': {
      const m = subMonths(now, 1)
      return { from: startOfMonth(m), to: endOfMonth(m) }
    }
    case 'last30':
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) }
    case 'thisYear':
      return { from: startOfYear(now), to: endOfYear(now) }
  }
}

export function weekRange(date: Date, weekStartsOn: 0 | 1): DateRange {
  return { from: startOfWeek(date, { weekStartsOn }), to: endOfWeek(date, { weekStartsOn }) }
}

export function daysOf(range: DateRange): Date[] {
  const days: Date[] = []
  for (let d = startOfDay(range.from); d <= range.to; d = addDays(d, 1)) days.push(d)
  return days
}

export function shiftRange(range: DateRange, unit: 'week' | 'month', amount: number): DateRange {
  const shift = unit === 'week' ? addWeeks : addMonths
  return { from: shift(range.from, amount), to: unit === 'week' ? shift(range.to, amount) : endOfMonth(shift(range.from, amount)) }
}

/** Combines a calendar day with minutes since midnight. */
export function atMinutes(day: Date, minutes: number): Date {
  const d = startOfDay(day)
  d.setMinutes(minutes)
  return d
}

export const toDateInput = (d: Date) => format(d, 'yyyy-MM-dd')
export const toTimeInput = (d: Date) => format(d, 'HH:mm')
