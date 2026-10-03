import { describe, expect, it } from 'vitest'
import { formatDays, formatDuration, parseDuration, parseTimeOfDay, roundSeconds } from './duration'
import { buildLookup, budgetLevel, filterEntries, goalSeconds, NONE, projectExhaustion, totalsBy, EMPTY_FILTERS } from './stats'
import { presetRange } from './dates'
import { nextColor, PALETTE } from './colors'
import type { Project, TimeEntry } from './types'

describe('durations', () => {
  it('formats in the three styles', () => {
    expect(formatDuration(5400, 'hm', 'fr')).toBe('1 h 30')
    expect(formatDuration(2700, 'hm', 'fr')).toBe('45 min')
    expect(formatDuration(5400, 'hm', 'en')).toBe('1h 30m')
    expect(formatDuration(5400, 'decimal', 'fr')).toBe('1,5 h')
    expect(formatDuration(3725, 'clock', 'en')).toBe('1:02:05')
  })

  it('formats days with the day length', () => {
    expect(formatDays(7 * 3600 * 2.5, 7, 'fr')).toBe('2,5 j')
    expect(formatDays(8 * 3600, 8, 'en')).toBe('1 d')
  })

  it('parses typed durations', () => {
    expect(parseDuration('2')).toBe(7200)
    expect(parseDuration('1,5')).toBe(5400)
    expect(parseDuration('1:30')).toBe(5400)
    expect(parseDuration('1h30')).toBe(5400)
    expect(parseDuration('1 h 05')).toBe(3900)
    expect(parseDuration('2h')).toBe(7200)
    expect(parseDuration('90m')).toBe(5400)
    expect(parseDuration('45 min')).toBe(2700)
    expect(parseDuration('abc')).toBeNull()
    expect(parseDuration('')).toBeNull()
  })

  it('parses times of day', () => {
    expect(parseTimeOfDay('9')).toBe(540)
    expect(parseTimeOfDay('930')).toBe(570)
    expect(parseTimeOfDay('9:30')).toBe(570)
    expect(parseTimeOfDay('14h30')).toBe(870)
    expect(parseTimeOfDay('14h')).toBe(840)
    expect(parseTimeOfDay('25:00')).toBeNull()
  })

  it('rounds', () => {
    expect(roundSeconds(8 * 60, 15, 'nearest')).toBe(15 * 60)
    expect(roundSeconds(7 * 60, 15, 'nearest')).toBe(0)
    expect(roundSeconds(1 * 60, 15, 'up')).toBe(15 * 60)
    expect(roundSeconds(14 * 60, 15, 'down')).toBe(0)
    expect(roundSeconds(123, 0, 'up')).toBe(123)
  })
})

const project = (id: string, categoryId: string | null): Project => ({
  id,
  categoryId,
  name: id,
  color: '#000000',
  archivedAt: null,
  createdAt: '',
  budgetDays: null,
  goalAmount: null,
  goalUnit: null,
  goalPeriod: null,
})

const entry = (id: string, projectId: string | null, hours: number, tagIds: string[] = [], start = '2026-10-01T09:00:00Z'): TimeEntry => ({
  id,
  projectId,
  description: id,
  tagIds,
  start,
  end: new Date(new Date(start).getTime() + hours * 3600_000).toISOString(),
})

describe('stats', () => {
  const projects = [project('p1', 'c1'), project('p2', null)]
  const lookup = buildLookup([], projects, [])
  const entries = [entry('a', 'p1', 1, ['t1']), entry('b', 'p2', 2, ['t1', 't2']), entry('c', null, 0.5)]
  const noRounding = { roundingMinutes: 0, roundingMode: 'nearest' as const }

  it('totals by project, category and tag', () => {
    expect(totalsBy(entries, 'project', lookup, noRounding)).toEqual([
      { key: 'p2', seconds: 7200 },
      { key: 'p1', seconds: 3600 },
      { key: NONE, seconds: 1800 },
    ])
    expect(totalsBy(entries, 'category', lookup, noRounding)).toEqual([
      { key: NONE, seconds: 9000 },
      { key: 'c1', seconds: 3600 },
    ])
    const tags = totalsBy(entries, 'tag', lookup, noRounding)
    expect(tags.find((t) => t.key === 't1')?.seconds).toBe(10800)
    expect(tags.find((t) => t.key === NONE)?.seconds).toBe(1800)
  })

  it('filters by category, tag and text', () => {
    const byCat = filterEntries(entries, { ...EMPTY_FILTERS, categoryIds: ['c1'] }, lookup.projects)
    expect(byCat.map((e) => e.id)).toEqual(['a'])
    const untagged = filterEntries(entries, { ...EMPTY_FILTERS, tagIds: [NONE] }, lookup.projects)
    expect(untagged.map((e) => e.id)).toEqual(['c'])
    const text = filterEntries(entries, { ...EMPTY_FILTERS, text: 'B' }, lookup.projects)
    expect(text.map((e) => e.id)).toEqual(['b'])
  })

  it('computes goals in days and budget levels', () => {
    expect(goalSeconds({ budgetDays: null, goalAmount: 2, goalUnit: 'days', goalPeriod: 'month' }, 7)).toBe(14 * 3600)
    expect(budgetLevel(0.5)).toBe('ok')
    expect(budgetLevel(0.85)).toBe('warning')
    expect(budgetLevel(1.2)).toBe('over')
  })

  it('projects budget exhaustion from recent pace', () => {
    const now = new Date('2026-10-29T00:00:00Z')
    // 28 h over the last 28 days = 1 h/day, 10 h left => 10 days.
    const recent = Array.from({ length: 28 }, (_, i) => entry(`r${i}`, 'p1', 1, [], new Date(now.getTime() - (i + 1) * 86400_000).toISOString()))
    const eta = projectExhaustion(recent, 10 * 3600, noRounding, now)
    expect(eta?.toISOString()).toBe('2026-11-08T00:00:00.000Z')
    expect(projectExhaustion([], 3600, noRounding, now)).toBeNull()
  })
})

describe('dates and colors', () => {
  it('starts weeks on the chosen day', () => {
    const wed = new Date(2026, 9, 7)
    expect(presetRange('thisWeek', 1, wed).from.getDay()).toBe(1)
    expect(presetRange('thisWeek', 0, wed).from.getDay()).toBe(0)
  })

  it('picks the first unused palette color', () => {
    expect(nextColor([])).toBe(PALETTE[0].light)
    expect(nextColor([PALETTE[0].light.toLowerCase()])).toBe(PALETTE[1].light)
  })
})
