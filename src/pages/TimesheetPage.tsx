import clsx from 'clsx'
import { addMinutes, isToday } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ProjectPicker } from '../components/pickers'
import { Button, ColorDot, IconButton, PageHeader } from '../components/ui'
import { useEntries, useEntryMutations, useLabels, useLookup, useSettings } from '../data/hooks'
import { atMinutes, dayKey, daysOf, shiftRange, weekRange } from '../lib/dates'
import { formatClock, parseDuration } from '../lib/duration'
import { useFormat } from '../lib/format'
import { entrySeconds, NONE } from '../lib/stats'
import { useColor } from '../lib/theme'
import type { DateRange, TimeEntry } from '../lib/types'

const hm = (seconds: number) => (seconds ? formatClock(seconds).replace(/:\d\d$/, '') : '')

export function TimesheetPage() {
  const { t } = useTranslation()
  const settings = useSettings()
  const labels = useLabels()
  const fmt = useFormat()
  const color = useColor()
  const { projects, categories } = useLookup()
  const [range, setRange] = useState<DateRange>(() => weekRange(new Date(), settings.weekStart))
  const [extraRows, setExtraRows] = useState<string[]>([])
  const { data: entries = [] } = useEntries(range)
  const { create, update, remove } = useEntryMutations()

  const days = daysOf(range)
  const closed = useMemo(() => entries.filter((e) => e.end), [entries])

  const cells = useMemo(() => {
    const map = new Map<string, TimeEntry[]>()
    for (const e of closed) {
      const key = `${e.projectId ?? NONE}|${dayKey(e.start)}`
      map.set(key, [...(map.get(key) ?? []), e])
    }
    return map
  }, [closed])

  const rows = useMemo(() => {
    const ids = new Set<string>(closed.map((e) => e.projectId ?? NONE))
    extraRows.forEach((id) => ids.add(id))
    const list = [...ids]
    const name = (id: string) => {
      const p = projects.get(id)
      if (!p) return '￿'
      return `${p.categoryId ? (categories.get(p.categoryId)?.name ?? '') : '￿'} ${p.name}`
    }
    return list.sort((a, b) => name(a).localeCompare(name(b)))
  }, [closed, extraRows, projects, categories])

  const cellSeconds = (projectId: string, day: Date) =>
    (cells.get(`${projectId}|${dayKey(day)}`) ?? []).reduce((s, e) => s + entrySeconds(e), 0)

  /** Sets a cell to a duration by adding an entry or trimming the latest ones. */
  const setCell = async (projectId: string, day: Date, target: number) => {
    const list = [...(cells.get(`${projectId}|${dayKey(day)}`) ?? [])].sort((a, b) => a.start.localeCompare(b.start))
    const current = list.reduce((s, e) => s + entrySeconds(e), 0)
    let diff = Math.round(target - current)
    if (Math.abs(diff) < 60) return

    if (diff > 0) {
      // Append after the last entry of the day, any project, or at 9:00.
      const sameDay = closed.filter((e) => dayKey(e.start) === dayKey(day))
      const lastEnd = sameDay.reduce<Date | null>((max, e) => (!max || new Date(e.end!) > max ? new Date(e.end!) : max), null)
      const start = lastEnd ?? atMinutes(day, 9 * 60)
      await create.mutateAsync({
        projectId: projectId === NONE ? null : projectId,
        description: '',
        tagIds: [],
        start: start.toISOString(),
        end: addMinutes(start, diff / 60).toISOString(),
      })
      return
    }

    for (const e of list.reverse()) {
      if (diff >= 0) break
      const d = entrySeconds(e)
      if (d <= -diff) {
        await remove.mutateAsync(e.id)
        diff += d
      } else {
        await update.mutateAsync({ id: e.id, patch: { end: new Date(new Date(e.end!).getTime() + diff * 1000).toISOString() } })
        diff = 0
      }
    }
  }

  const dayTotals = days.map((d) => closed.filter((e) => dayKey(e.start) === dayKey(d)).reduce((s, e) => s + entrySeconds(e), 0))
  const weekTotal = dayTotals.reduce((a, b) => a + b, 0)

  return (
    <div>
      <PageHeader title={t('nav.timesheet')}>
        <div className="flex items-center gap-1">
          <IconButton label={t('common.previous')} onClick={() => setRange(shiftRange(range, 'week', -1))}>
            <ChevronLeft size={18} />
          </IconButton>
          <Button size="sm" onClick={() => setRange(weekRange(new Date(), settings.weekStart))}>
            {t('time.thisWeek')}
          </Button>
          <IconButton label={t('common.next')} onClick={() => setRange(shiftRange(range, 'week', 1))}>
            <ChevronRight size={18} />
          </IconButton>
        </div>
        <span className="text-sm text-muted">
          {fmt.date(range.from, 'd MMM')} – {fmt.date(range.to, 'd MMM yyyy')}
        </span>
      </PageHeader>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-surface-2 text-left">
              <th className="px-4 py-2.5 font-semibold text-ink-2">{labels.level2}</th>
              {days.map((d) => (
                <th key={d.toISOString()} className={clsx('w-20 px-1 py-2.5 text-center font-semibold capitalize', isToday(d) ? 'text-brand-strong' : 'text-ink-2')}>
                  <div>{fmt.date(d, 'EEE')}</div>
                  <div className="text-xs font-normal text-subtle">{fmt.date(d, 'd MMM')}</div>
                </th>
              ))}
              <th className="w-24 px-4 py-2.5 text-right font-semibold text-ink-2">{t('common.total')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((id) => {
              const p = projects.get(id)
              const rowTotal = days.reduce((s, d) => s + cellSeconds(id, d), 0)
              return (
                <tr key={id}>
                  <td className="max-w-[16rem] px-4 py-1.5">
                    <div className="flex items-center gap-2">
                      <ColorDot color={color(p?.color)} />
                      <span className="truncate font-medium text-ink">{p?.name ?? t('picker.noProject', { level: labels.level2 })}</span>
                    </div>
                    {p?.categoryId && <div className="truncate pl-4.5 text-xs text-subtle">{categories.get(p.categoryId)?.name}</div>}
                  </td>
                  {days.map((d) => (
                    <td key={d.toISOString()} className="px-1 py-1.5 text-center">
                      <Cell seconds={cellSeconds(id, d)} onCommit={(s) => setCell(id, d, s)} label={`${p?.name ?? ''} ${fmt.date(d, 'EEEE d')}`} />
                    </td>
                  ))}
                  <td className="tabular px-4 py-1.5 text-right font-semibold text-ink">{rowTotal ? fmt.duration(rowTotal) : '–'}</td>
                </tr>
              )
            })}
            <tr>
              <td className="px-3 py-2" colSpan={days.length + 2}>
                <ProjectAdder onAdd={(id) => setExtraRows((r) => (r.includes(id) ? r : [...r, id]))} />
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border-strong bg-surface-2">
              <td className="px-4 py-2.5 font-semibold text-ink-2">{t('common.total')}</td>
              {dayTotals.map((s, i) => (
                <td key={i} className="tabular px-1 py-2.5 text-center font-semibold text-ink">
                  {s ? fmt.duration(s) : '–'}
                </td>
              ))}
              <td className="tabular px-4 py-2.5 text-right font-bold text-brand-strong">{fmt.duration(weekTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 text-xs text-subtle">{t('timesheet.hint')}</p>
    </div>
  )
}

function Cell({ seconds, onCommit, label }: { seconds: number; onCommit: (seconds: number) => void; label: string }) {
  const [text, setText] = useState(hm(seconds))
  const [shown, setShown] = useState(seconds)
  if (seconds !== shown) {
    setShown(seconds)
    setText(hm(seconds))
  }
  const commit = () => {
    const value = text.trim() === '' ? 0 : parseDuration(text)
    if (value === null) {
      setText(hm(seconds))
      return
    }
    if (value !== seconds) onCommit(value)
  }
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      aria-label={label}
      placeholder="–"
      inputMode="decimal"
      className="tabular h-9 w-full rounded-md border border-transparent bg-transparent text-center text-ink placeholder:text-subtle hover:border-border-strong focus:border-accent-2 focus:bg-surface focus:outline-none"
    />
  )
}

function ProjectAdder({ onAdd }: { onAdd: (projectId: string) => void }) {
  const { t } = useTranslation()
  const labels = useLabels()
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <Plus size={16} />
      <span>{t('timesheet.addRow', { level: labels.level2 })}</span>
      <ProjectPicker value={null} onChange={(id) => onAdd(id ?? NONE)} />
    </div>
  )
}
