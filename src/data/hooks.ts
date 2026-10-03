import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { buildLookup } from '../lib/stats'
import type { CategoryInput, DateRange, EntryPatch, NewEntry, Profile, ProjectInput, TimeEntry } from '../lib/types'
import type { DataApi, StartTimerInput, Table } from './api'

export function useApi(): DataApi {
  const { api } = useAuth()
  if (!api) throw new Error('API used while signed out')
  return api
}

export const keys = {
  profile: ['profile'] as const,
  categories: ['categories'] as const,
  projects: ['projects'] as const,
  tags: ['tags'] as const,
  entries: ['entries'] as const,
  entriesIn: (range: DateRange | null) =>
    ['entries', range ? range.from.toISOString() : 'all', range ? range.to.toISOString() : 'all'] as const,
  running: ['running'] as const,
}

const tableKeys: Record<Table, readonly (readonly string[])[]> = {
  profiles: [keys.profile],
  categories: [keys.categories, keys.projects],
  projects: [keys.projects, keys.entries, keys.running],
  tags: [keys.tags, keys.entries, keys.running],
  time_entries: [keys.entries, keys.running],
}

function invalidate(qc: QueryClient, table: Table) {
  for (const key of tableKeys[table]) qc.invalidateQueries({ queryKey: key })
}

/** Keeps every open tab and device in sync. */
export function useRealtimeSync() {
  const api = useApi()
  const qc = useQueryClient()
  useEffect(() => api.subscribe((table) => invalidate(qc, table)), [api, qc])
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export function useProfile() {
  const api = useApi()
  return useQuery({ queryKey: keys.profile, queryFn: () => api.getProfile(), staleTime: Infinity })
}

/** The profile, once loaded (the app shell waits for it). */
export function useSettings(): Profile {
  const { data } = useProfile()
  if (!data) throw new Error('Profile not loaded')
  return data
}

export function useUpdateProfile() {
  const api = useApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<Omit<Profile, 'id'>>) => api.updateProfile(patch),
    onMutate: (patch) => {
      const previous = qc.getQueryData<Profile>(keys.profile)
      if (previous) qc.setQueryData(keys.profile, { ...previous, ...patch })
      return { previous }
    },
    onError: (_e, _p, ctx) => ctx?.previous && qc.setQueryData(keys.profile, ctx.previous),
    onSuccess: (profile) => qc.setQueryData(keys.profile, profile),
  })
}

export function useLabels() {
  const p = useSettings()
  return {
    level1: p.level1Label,
    level1Plural: p.level1LabelPlural,
    level2: p.level2Label,
    level2Plural: p.level2LabelPlural,
  }
}

// ---------------------------------------------------------------------------
// Categories, projects, tags
// ---------------------------------------------------------------------------

export function useCategories() {
  const api = useApi()
  return useQuery({ queryKey: keys.categories, queryFn: () => api.listCategories() })
}

export function useProjects() {
  const api = useApi()
  return useQuery({ queryKey: keys.projects, queryFn: () => api.listProjects() })
}

export function useTags() {
  const api = useApi()
  return useQuery({ queryKey: keys.tags, queryFn: () => api.listTags() })
}

export function useLookup() {
  const { data: categories = [] } = useCategories()
  const { data: projects = [] } = useProjects()
  const { data: tags = [] } = useTags()
  return useMemo(() => ({ ...buildLookup(categories, projects, tags), categoryList: categories, projectList: projects, tagList: tags }), [categories, projects, tags])
}

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, table: Table) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSettled: () => invalidate(qc, table) })
}

export function useCategoryMutations() {
  const api = useApi()
  return {
    create: useInvalidating((input: CategoryInput) => api.createCategory(input), 'categories'),
    update: useInvalidating(({ id, patch }: { id: string; patch: Partial<CategoryInput> }) => api.updateCategory(id, patch), 'categories'),
    remove: useInvalidating((id: string) => api.deleteCategory(id), 'categories'),
  }
}

export function useProjectMutations() {
  const api = useApi()
  return {
    create: useInvalidating((input: ProjectInput) => api.createProject(input), 'projects'),
    update: useInvalidating(({ id, patch }: { id: string; patch: Partial<ProjectInput> }) => api.updateProject(id, patch), 'projects'),
    remove: useInvalidating((id: string) => api.deleteProject(id), 'projects'),
  }
}

export function useTagMutations() {
  const api = useApi()
  return {
    create: useInvalidating((name: string) => api.createTag(name), 'tags'),
    update: useInvalidating(({ id, name }: { id: string; name: string }) => api.updateTag(id, name), 'tags'),
    remove: useInvalidating((id: string) => api.deleteTag(id), 'tags'),
  }
}

// ---------------------------------------------------------------------------
// Time entries
// ---------------------------------------------------------------------------

export function useEntries(range: DateRange | null, enabled = true) {
  const api = useApi()
  return useQuery({ queryKey: keys.entriesIn(range), queryFn: () => api.listEntries(range), enabled })
}

export function useRunningEntry() {
  const api = useApi()
  return useQuery({ queryKey: keys.running, queryFn: () => api.getRunningEntry(), refetchOnWindowFocus: true })
}

function patchEntryCaches(qc: QueryClient, id: string, patch: EntryPatch) {
  qc.setQueriesData<TimeEntry[]>({ queryKey: keys.entries }, (list) =>
    list?.map((e) => (e.id === id ? { ...e, ...patch } : e)),
  )
  qc.setQueryData<TimeEntry | null>(keys.running, (running) =>
    running && running.id === id ? { ...running, ...patch } : running,
  )
}

export function useEntryMutations() {
  const api = useApi()
  const qc = useQueryClient()
  const settle = () => invalidate(qc, 'time_entries')

  return {
    create: useMutation({ mutationFn: (input: NewEntry) => api.createEntry(input), onSettled: settle }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: EntryPatch }) => api.updateEntry(id, patch),
      // Optimistic, so drags in the calendar and inline edits feel instant.
      onMutate: async ({ id, patch }) => {
        await qc.cancelQueries({ queryKey: keys.entries })
        patchEntryCaches(qc, id, patch)
      },
      onSettled: settle,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.deleteEntry(id),
      onMutate: (id) => {
        qc.setQueriesData<TimeEntry[]>({ queryKey: keys.entries }, (list) => list?.filter((e) => e.id !== id))
      },
      onSettled: settle,
    }),
    start: useMutation({
      mutationFn: (input: StartTimerInput) => api.startTimer(input),
      onSuccess: (entry) => qc.setQueryData(keys.running, entry),
      onSettled: settle,
    }),
    stop: useMutation({
      mutationFn: ({ id, end }: { id: string; end?: Date }) => api.stopTimer(id, end),
      onMutate: () => {
        qc.setQueryData(keys.running, null)
      },
      onSettled: settle,
    }),
  }
}

/** Re-renders every `ms` milliseconds; used for running timers. */
export function useNow(ms = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(id)
  }, [ms, enabled])
  return now
}
