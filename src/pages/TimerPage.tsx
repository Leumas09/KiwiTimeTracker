import { endOfDay, isToday, isYesterday, startOfDay, subDays } from 'date-fns'
import { Clock, Play } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EntryEditor, type EntryDraft } from '../components/EntryEditor'
import { ProjectPicker, TagPicker } from '../components/pickers'
import { Button, EmptyState, IconButton, PageHeader, Spinner } from '../components/ui'
import { useEntries, useEntryMutations, useLookup } from '../data/hooks'
import { dayKey, fromDayKey } from '../lib/dates'
import { useFormat } from '../lib/format'
import { entrySeconds } from '../lib/stats'
import { useColor } from '../lib/theme'
import type { TimeEntry } from '../lib/types'

export function TimerPage() {
  const { t } = useTranslation()
  const fmt = useFormat()
  const [weeks, setWeeks] = useState(1)
  const [editing, setEditing] = useState<EntryDraft | null>(null)
  const today = dayKey(new Date())

  const range = useMemo(
    () => ({ from: startOfDay(subDays(fromDayKey(today), weeks * 7 - 1)), to: endOfDay(fromDayKey(today)) }),
    [today, weeks],
  )
  const { data: entries, isLoading, isFetching } = useEntries(range)

  const days = useMemo(() => {
    const groups = new Map<string, TimeEntry[]>()
    for (const e of entries ?? []) {
      if (!e.end) continue
      const key = dayKey(e.start)
      groups.set(key, [...(groups.get(key) ?? []), e])
    }
    return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a))
  }, [entries])

  const dayLabel = (key: string) => {
    const d = fromDayKey(key)
    if (isToday(d)) return t('time.today')
    if (isYesterday(d)) return t('time.yesterday')
    return fmt.date(d, 'EEEE d MMMM')
  }

  return (
    <div>
      <PageHeader title={t('nav.timer')} />
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : days.length === 0 ? (
        <EmptyState icon={<Clock size={32} />} title={t('timer.emptyTitle')}>
          {t('timer.emptyBody')}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {days.map(([key, list]) => (
            <section key={key} className="overflow-hidden rounded-xl border border-border bg-surface">
              <header className="flex items-center justify-between bg-surface-2 px-4 py-2.5">
                <h2 className="text-sm font-semibold capitalize text-ink-2">{dayLabel(key)}</h2>
                <span className="tabular text-sm font-semibold text-ink">{fmt.duration(list.reduce((s, e) => s + entrySeconds(e), 0))}</span>
              </header>
              <ul className="divide-y divide-border">
                {list.map((e) => (
                  <EntryRow key={e.id} entry={e} onEdit={() => setEditing(e)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <div className="mt-6 flex justify-center">
        <Button onClick={() => setWeeks((w) => w + 1)} disabled={isFetching}>
          {t('timer.loadMore')}
        </Button>
      </div>
      <EntryEditor draft={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function EntryRow({ entry, onEdit }: { entry: TimeEntry; onEdit: () => void }) {
  const { t } = useTranslation()
  const fmt = useFormat()
  const color = useColor()
  const { projects } = useLookup()
  const { update, start } = useEntryMutations()
  const [description, setDescription] = useState(entry.description)
  const [lastSaved, setLastSaved] = useState(entry.description)
  // Keep the field in sync when the entry changes elsewhere.
  if (entry.description !== lastSaved) {
    setLastSaved(entry.description)
    setDescription(entry.description)
  }

  const project = entry.projectId ? projects.get(entry.projectId) : undefined

  const saveDescription = () => {
    const value = description.trim()
    if (value !== entry.description) update.mutate({ id: entry.id, patch: { description: value } })
  }

  return (
    <li className="group flex items-center gap-2 px-3 py-2 sm:px-4">
      <span aria-hidden className="h-9 w-1 shrink-0 self-stretch rounded-full sm:h-8 sm:self-center" style={{ background: color(project?.color) }} />
      <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-2">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          placeholder={t('timer.noDescription')}
          aria-label={t('entry.description')}
          className="h-9 min-w-0 rounded-md bg-transparent px-1.5 text-sm text-ink placeholder:text-subtle hover:bg-surface-2 focus:bg-surface-2 focus:outline-none sm:flex-1"
        />
        <div className="-ml-1 flex min-w-0 items-center overflow-hidden sm:ml-0 sm:max-w-[45%]">
          <ProjectPicker value={entry.projectId} onChange={(projectId) => update.mutate({ id: entry.id, patch: { projectId } })} />
          <TagPicker value={entry.tagIds} onChange={(tagIds) => update.mutate({ id: entry.id, patch: { tagIds } })} />
        </div>
      </div>
      <button type="button" onClick={onEdit} className="flex shrink-0 flex-col items-end rounded-md px-1.5 py-1 hover:bg-surface-3 sm:flex-row sm:items-center sm:gap-3">
        <span className="tabular text-xs text-muted">
          {fmt.time(entry.start)} – {entry.end ? fmt.time(entry.end) : '…'}
        </span>
        <span className="tabular text-sm font-semibold text-ink sm:w-16 sm:text-right">{fmt.duration(entrySeconds(entry))}</span>
      </button>
      <IconButton
        label={t('timer.continue')}
        size="sm"
        className="sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
        onClick={() => start.mutate({ description: entry.description, projectId: entry.projectId, tagIds: entry.tagIds })}
      >
        <Play size={16} />
      </IconButton>
    </li>
  )
}
