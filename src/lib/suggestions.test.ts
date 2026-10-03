import { describe, expect, it } from 'vitest'
import { normalize, recentActivities, removeToken, searchActivities, searchProjects, searchTags, tokenAt } from './suggestions'
import type { Category, Project, TimeEntry } from './types'

const entry = (description: string, projectId: string | null, start: string, tagIds: string[] = []): TimeEntry => ({
  id: start,
  description,
  projectId,
  tagIds,
  start,
  end: start,
})

const project = (id: string, name: string, categoryId: string | null = null): Project => ({
  id,
  name,
  categoryId,
  color: '#000000',
  archivedAt: null,
  createdAt: '',
  budgetDays: null,
  goalAmount: null,
  goalUnit: null,
  goalPeriod: null,
})

const category: Category = { id: 'c1', name: 'ACME', color: '#000', archivedAt: null, createdAt: '', budgetDays: null, goalAmount: null, goalUnit: null, goalPeriod: null }

describe('recent activities', () => {
  const entries = [
    entry('Réunion BI + CR', 'p1', '2026-10-01T09:00:00Z', ['t1']),
    entry('Réunion BI + CR', 'p1', '2026-10-02T09:00:00Z', ['t2']),
    entry('Script de suppression', 'p2', '2026-09-30T09:00:00Z'),
    entry('', null, '2026-10-02T10:00:00Z'),
  ]
  const activities = recentActivities(entries)
  const projects = new Map([
    ['p1', project('p1', 'Support', 'c1')],
    ['p2', project('p2', 'Développement')],
  ])
  const categories = new Map([['c1', category]])

  it('deduplicates, keeps the latest tags and skips empty entries', () => {
    expect(activities).toHaveLength(2)
    expect(activities[0]).toMatchObject({ description: 'Réunion BI + CR', count: 2, tagIds: ['t2'] })
  })

  it('searches words in any order, without accents, in project and client names', () => {
    expect(searchActivities(activities, 'reunion', projects, categories).map((a) => a.description)).toEqual(['Réunion BI + CR'])
    expect(searchActivities(activities, 'cr bi', projects, categories)).toHaveLength(1)
    expect(searchActivities(activities, 'acme', projects, categories)).toHaveLength(1)
    expect(searchActivities(activities, 'dévelop', projects, categories).map((a) => a.description)).toEqual(['Script de suppression'])
    expect(searchActivities(activities, '', projects, categories)).toHaveLength(2)
  })

  it('ranks matches at the start of the description first', () => {
    const list = recentActivities([entry('Revue de code', null, '2026-01-01T00:00:00Z'), entry('Préparer la revue', null, '2026-02-01T00:00:00Z')])
    expect(searchActivities(list, 'rev', new Map(), new Map())[0].description).toBe('Revue de code')
  })
})

describe('@ and # tokens', () => {
  it('finds the token at the caret', () => {
    expect(tokenAt('Audit @sup', 10)).toEqual({ kind: '@', query: 'sup', start: 6, end: 10 })
    expect(tokenAt('#', 1)).toEqual({ kind: '#', query: '', start: 0, end: 1 })
    expect(tokenAt('mail@example', 12)).toBeNull()
    expect(tokenAt('Audit sup', 9)).toBeNull()
    expect(tokenAt('Atelier @Projet tout neuf', 25)).toEqual({ kind: '@', query: 'Projet tout neuf', start: 8, end: 25 })
    expect(tokenAt('Atelier @ x', 11)).toBeNull()
  })

  it('removes a token cleanly', () => {
    expect(removeToken('Audit @sup final', { kind: '@', query: 'sup', start: 6, end: 10 })).toBe('Audit final')
  })

  it('searches projects and tags', () => {
    const projects = [project('p1', 'Support', 'c1'), project('p2', 'Supervision'), { ...project('p3', 'Superflu'), archivedAt: 'x' }]
    expect(searchProjects(projects, new Map([['c1', category]]), 'sup').map((p) => p.id)).toEqual(['p2', 'p1'])
    expect(searchProjects(projects, new Map([['c1', category]]), 'acme').map((p) => p.id)).toEqual(['p1'])
    const tags = [
      { id: 't1', name: 'réunion' },
      { id: 't2', name: 'support' },
    ]
    expect(searchTags(tags, 'reu', []).map((t) => t.id)).toEqual(['t1'])
    expect(searchTags(tags, '', ['t1']).map((t) => t.id)).toEqual(['t2'])
    expect(normalize('Élève')).toBe('eleve')
  })
})
