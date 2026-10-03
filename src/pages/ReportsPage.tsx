import clsx from 'clsx'
import { differenceInCalendarDays, endOfDay, startOfDay } from 'date-fns'
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { Donut, StackedBars, type Series } from '../components/charts'
import { EntryEditor, type EntryDraft } from '../components/EntryEditor'
import { Targets } from '../components/Targets'
import { Button, Card, ColorDot, EmptyState, IconButton, Input, PageHeader, Popover, Segmented, Select } from '../components/ui'
import { useEntries, useLabels, useLookup, useNow, useRunningEntry, useSettings } from '../data/hooks'
import { dayKey, fromDayKey, presetRange, RANGE_PRESETS, toDateInput, type RangePreset } from '../lib/dates'
import { useFormat, type Unit } from '../lib/format'
import { foldKeys, OTHER, useGroupMeta } from '../lib/series'
import {
  bucketKey,
  EMPTY_FILTERS,
  entryKeys,
  filterEntries,
  inRange,
  matrix,
  NONE,
  pickBucket,
  reportSeconds,
  sumSeconds,
  totalsBy,
  type Bucket,
  type Dimension,
  type EntryFilters,
} from '../lib/stats'
import type { DateRange, TimeEntry } from '../lib/types'

type Tab = 'summary' | 'detailed' | 'periodic' | 'targets'

export function ReportsPage() {
  const { t } = useTranslation()
  const settings = useSettings()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'summary'
  const [preset, setPreset] = useState<RangePreset | 'custom'>('thisMonth')
  const [range, setRange] = useState<DateRange>(() => presetRange('thisMonth', settings.weekStart))
  const [filters, setFilters] = useState<EntryFilters>(EMPTY_FILTERS)
  const [unit, setUnit] = useState<Unit>('hours')

  const { data: fetched = [] } = useEntries(range)
  const { data: running } = useRunningEntry()
  const now = useNow(60_000, !!running)
  const { projects } = useLookup()

  const entries = useMemo(() => {
    const list = fetched.filter((e) => e.end)
    if (running && inRange(running, range)) list.push(running)
    return filterEntries(list, filters, projects)
  }, [fetched, running, range, filters, projects])

  const tabs: { value: Tab; label: string }[] = [
    { value: 'summary', label: t('reports.summary') },
    { value: 'detailed', label: t('reports.detailed') },
    { value: 'periodic', label: t('reports.periodic') },
    { value: 'targets', label: t('targets.title') },
  ]

  return (
    <div>
      <PageHeader title={t('nav.reports')}>
        <div className="max-w-full overflow-x-auto">
          <Segmented value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} options={tabs} />
        </div>
      </PageHeader>

      {tab !== 'targets' && (
        <Filters
          preset={preset}
          range={range}
          filters={filters}
          unit={unit}
          onPreset={(p) => {
            setPreset(p)
            if (p !== 'custom') setRange(presetRange(p, settings.weekStart))
          }}
          onRange={(r) => {
            setPreset('custom')
            setRange(r)
          }}
          onFilters={setFilters}
          onUnit={setUnit}
        />
      )}

      {tab === 'summary' && <Summary entries={entries} range={range} unit={unit} now={now} />}
      {tab === 'detailed' && <Detailed entries={entries} now={now} />}
      {tab === 'periodic' && <Periodic entries={entries} unit={unit} now={now} />}
      {tab === 'targets' && <Targets />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

function Filters({
  preset,
  range,
  filters,
  unit,
  onPreset,
  onRange,
  onFilters,
  onUnit,
}: {
  preset: RangePreset | 'custom'
  range: DateRange
  filters: EntryFilters
  unit: Unit
  onPreset: (p: RangePreset | 'custom') => void
  onRange: (r: DateRange) => void
  onFilters: (f: EntryFilters) => void
  onUnit: (u: Unit) => void
}) {
  const { t } = useTranslation()
  const labels = useLabels()
  const { categoryList, projectList, tagList } = useLookup()

  const shift = (direction: 1 | -1) => {
    const days = differenceInCalendarDays(range.to, range.from) + 1
    const from = startOfDay(new Date(range.from.getTime() + direction * days * 86400_000))
    onRange({ from, to: endOfDay(new Date(from.getTime() + (days - 1) * 86400_000)) })
  }

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={preset} onChange={(e) => onPreset(e.target.value as RangePreset | 'custom')} className="h-9 w-auto" aria-label={t('reports.period')}>
          {RANGE_PRESETS.map((p) => (
            <option key={p} value={p}>
              {t(`presets.${p}`)}
            </option>
          ))}
          <option value="custom">{t('presets.custom')}</option>
        </Select>
        <div className="flex w-full items-center gap-1 sm:w-auto">
          <IconButton label={t('common.previous')} size="sm" onClick={() => shift(-1)}>
            <ChevronLeft size={16} />
          </IconButton>
          <Input
            type="date"
            value={toDateInput(range.from)}
            onChange={(e) => e.target.value && onRange({ from: startOfDay(fromDayKey(e.target.value)), to: range.to })}
            className="h-9 min-w-0 flex-1 px-2 sm:w-[9rem] sm:flex-none"
            aria-label={t('reports.from')}
          />
          <span className="text-subtle">–</span>
          <Input
            type="date"
            value={toDateInput(range.to)}
            onChange={(e) => e.target.value && onRange({ from: range.from, to: endOfDay(fromDayKey(e.target.value)) })}
            className="h-9 min-w-0 flex-1 px-2 sm:w-[9rem] sm:flex-none"
            aria-label={t('reports.to')}
          />
          <IconButton label={t('common.next')} size="sm" onClick={() => shift(1)}>
            <ChevronRight size={16} />
          </IconButton>
        </div>
        <div className="ml-auto">
          <Segmented
            size="sm"
            value={unit}
            onChange={onUnit}
            options={[
              { value: 'hours', label: t('reports.hours') },
              { value: 'days', label: t('reports.days') },
            ]}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <MultiFilter
          label={labels.level1Plural}
          noneLabel={t('picker.noCategory', { level: labels.level1 })}
          options={categoryList.map((c) => ({ value: c.id, label: c.name, color: c.color }))}
          value={filters.categoryIds}
          onChange={(categoryIds) => onFilters({ ...filters, categoryIds })}
        />
        <MultiFilter
          label={labels.level2Plural}
          noneLabel={t('picker.noProject', { level: labels.level2 })}
          options={projectList.map((p) => ({ value: p.id, label: p.name, color: p.color }))}
          value={filters.projectIds}
          onChange={(projectIds) => onFilters({ ...filters, projectIds })}
        />
        <MultiFilter
          label={t('picker.tags')}
          noneLabel={t('picker.noTags')}
          options={tagList.map((tag) => ({ value: tag.id, label: tag.name }))}
          value={filters.tagIds}
          onChange={(tagIds) => onFilters({ ...filters, tagIds })}
        />
        <div className="flex h-9 min-w-[10rem] flex-1 items-center gap-2 rounded-lg border border-border-strong px-2.5 sm:max-w-xs">
          <Search size={15} className="text-subtle" />
          <input
            value={filters.text}
            onChange={(e) => onFilters({ ...filters, text: e.target.value })}
            placeholder={t('reports.search')}
            className="w-full bg-transparent text-sm text-ink placeholder:text-subtle focus:outline-none"
          />
        </div>
        {(filters.categoryIds.length > 0 || filters.projectIds.length > 0 || filters.tagIds.length > 0 || filters.text !== '') && (
          <Button size="sm" variant="ghost" onClick={() => onFilters(EMPTY_FILTERS)}>
            {t('reports.clear')}
          </Button>
        )}
      </div>
    </div>
  )
}

function MultiFilter({
  label,
  noneLabel,
  options,
  value,
  onChange,
}: {
  label: string
  noneLabel: string
  options: { value: string; label: string; color?: string }[]
  value: string[]
  onChange: (value: string[]) => void
}) {
  const all = [{ value: NONE, label: noneLabel }, ...options]
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  return (
    <Popover
      trigger={
        <button
          type="button"
          className={clsx(
            'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm',
            value.length ? 'border-accent-2 bg-brand-soft text-brand-strong' : 'border-border-strong text-ink-2 hover:bg-surface-2',
          )}
        >
          {label}
          {value.length > 0 && <span className="rounded-full bg-brand-strong px-1.5 text-xs text-on-brand">{value.length}</span>}
          <ChevronDown size={14} />
        </button>
      }
    >
      <div className="max-h-72 overflow-y-auto">
        {all.map((o) => (
          <button
            key={o.value}
            type="button"
            role="checkbox"
            aria-checked={value.includes(o.value)}
            onClick={() => toggle(o.value)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-ink hover:bg-surface-3"
          >
            <span className={clsx('flex size-4 items-center justify-center rounded border', value.includes(o.value) ? 'border-accent-2 bg-accent-2 text-white' : 'border-border-strong')}>
              {value.includes(o.value) && <Check size={12} />}
            </span>
            {'color' in o && o.color && <ColorDot color={o.color} />}
            <span className={clsx('truncate', o.value === NONE && 'text-muted')}>{o.label}</span>
          </button>
        ))}
      </div>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function Summary({ entries, range, unit, now }: { entries: TimeEntry[]; range: DateRange; unit: Unit; now: number }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const labels = useLabels()
  const fmt = useFormat()
  const meta = useGroupMeta()
  const lookup = useLookup()
  const [dimension, setDimension] = useState<Dimension>('project')

  const total = sumSeconds(entries, settings, now)
  const activeDays = new Set(entries.map((e) => dayKey(e.start))).size
  const totals = totalsBy(entries, dimension, lookup, settings, now)
  const { keep, folded } = foldKeys(totals)
  const bucket = pickBucket(range)
  const grid = matrix(entries, bucket, dimension, lookup, settings, now)

  const series: Series[] = [...totals.filter((g) => keep.has(g.key)).map((g) => g.key), ...(folded ? [OTHER] : [])].map((key) => ({
    key,
    ...meta(dimension, key),
  }))

  const bucketLabel = (key: string, b: Bucket, long = false) => {
    const d = fromDayKey(key)
    if (b === 'day') return fmt.date(d, long ? 'EEEE d MMMM' : 'd MMM')
    if (b === 'week') return long ? t('reports.weekOf', { date: fmt.date(d, 'd MMMM') }) : fmt.date(d, 'd MMM')
    return fmt.date(d, long ? 'MMMM yyyy' : 'MMM yy')
  }

  const chartData = bucketKeys(range, bucket, settings.weekStart).map((key) => {
    const row: Record<string, number | string> = { label: bucketLabel(key, bucket), tooltipLabel: bucketLabel(key, bucket, true) }
    for (const s of series) row[s.key] = 0
    for (const [group, seconds] of grid.get(key) ?? []) {
      const k = keep.has(group) ? group : OTHER
      row[k] = (row[k] as number) + fmt.amount(seconds, unit)
    }
    return row
  })

  const donut = series.map((s) => ({
    ...s,
    value: s.key === OTHER ? totals.filter((g) => !keep.has(g.key)).reduce((a, g) => a + g.seconds, 0) : (totals.find((g) => g.key === s.key)?.seconds ?? 0),
  }))

  const unitAxis = (v: number) => `${fmt.number(v, 1)} ${unit === 'days' ? (settings.locale === 'fr' ? 'j' : 'd') : 'h'}`

  if (!entries.length) return <EmptyState title={t('reports.empty')} />

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Kpi label={t('common.total')} value={fmt.value(total, unit)} sub={unit === 'hours' ? fmt.days(total) : fmt.duration(total)} />
        <Kpi label={t('reports.dailyAverage')} value={fmt.value(activeDays ? total / activeDays : 0, unit)} sub={t('reports.activeDays', { count: activeDays })} />
        <Kpi label={t('reports.entries')} value={String(entries.length)} />
      </div>

      <Card
        title={t('reports.overTime')}
        action={
          <Segmented
            size="sm"
            value={dimension}
            onChange={setDimension}
            options={[
              { value: 'category', label: labels.level1 },
              { value: 'project', label: labels.level2 },
              { value: 'tag', label: t('reports.tag') },
            ]}
          />
        }
      >
        <StackedBars data={chartData} series={series} formatValue={(v) => fmt.value(unit === 'days' ? v * settings.dayHours * 3600 : v * 3600, unit)} formatAxis={unitAxis} height={260} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card title={t('reports.breakdown')} className="lg:col-span-2">
          <Donut
            data={donut}
            formatValue={(s) => fmt.value(s, unit)}
            center={
              <>
                <span className="tabular font-display text-xl font-semibold text-ink">{fmt.value(total, unit)}</span>
                <span className="text-xs text-subtle">{t('common.total')}</span>
              </>
            }
          />
        </Card>
        <Card title={t('reports.table')} className="lg:col-span-3">
          <BreakdownTable entries={entries} dimension={dimension} totals={totals} total={total} unit={unit} now={now} />
        </Card>
      </div>
    </div>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 sm:p-4">
      <div className="text-xs font-medium text-muted sm:text-sm">{label}</div>
      <div className="tabular mt-1 font-display text-lg font-semibold text-ink sm:text-2xl">{value}</div>
      {sub && <div className="tabular mt-0.5 text-xs text-subtle">{sub}</div>}
    </div>
  )
}

function bucketKeys(range: DateRange, bucket: Bucket, weekStart: 0 | 1): string[] {
  const keys: string[] = []
  for (let d = startOfDay(range.from); d <= range.to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const k = bucketKey(d, bucket, weekStart)
    if (keys[keys.length - 1] !== k) keys.push(k)
  }
  return keys
}

/** Totals by group; categories expand into their projects. */
function BreakdownTable({
  entries,
  dimension,
  totals,
  total,
  unit,
  now,
}: {
  entries: TimeEntry[]
  dimension: Dimension
  totals: { key: string; seconds: number }[]
  total: number
  unit: Unit
  now: number
}) {
  const settings = useSettings()
  const fmt = useFormat()
  const meta = useGroupMeta()
  const lookup = useLookup()

  const children = (categoryKey: string) =>
    totalsBy(
      entries.filter((e) => entryKeys(e, 'category', lookup)[0] === categoryKey),
      'project',
      lookup,
      settings,
      now,
    )

  return (
    <table className="w-full text-sm">
      <tbody className="divide-y divide-border">
        {totals.map((g) => {
          const m = meta(dimension, g.key)
          return (
            <Fragment key={g.key}>
              <tr>
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-2">
                    <ColorDot color={m.color} />
                    <span className="truncate font-medium text-ink">{m.name}</span>
                  </div>
                </td>
                <td className="tabular py-2 text-right font-semibold text-ink">{fmt.value(g.seconds, unit)}</td>
                <td className="tabular w-16 py-2 text-right text-muted">{fmt.percent(total ? g.seconds / total : 0)}</td>
              </tr>
              {dimension === 'category' &&
                children(g.key).map((c) => (
                  <tr key={`${g.key}-${c.key}`} className="border-t-0">
                    <td className="py-1.5 pl-5 pr-2 text-ink-2">{meta('project', c.key).name}</td>
                    <td className="tabular py-1.5 text-right text-ink-2">{fmt.value(c.seconds, unit)}</td>
                    <td className="tabular py-1.5 text-right text-subtle">{fmt.percent(total ? c.seconds / total : 0)}</td>
                  </tr>
                ))}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Detailed
// ---------------------------------------------------------------------------

function Detailed({ entries, now }: { entries: TimeEntry[]; now: number }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const labels = useLabels()
  const fmt = useFormat()
  const meta = useGroupMeta()
  const { projects, categories, tags } = useLookup()
  const [limit, setLimit] = useState(100)
  const [editing, setEditing] = useState<EntryDraft | null>(null)

  if (!entries.length) return <EmptyState title={t('reports.empty')} />

  const sorted = [...entries].sort((a, b) => b.start.localeCompare(a.start))
  const total = sumSeconds(entries, settings, now)

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 text-sm">
        <span className="text-muted">{t('reports.entriesCount', { count: entries.length })}</span>
        <span>
          {t('common.total')} <strong className="tabular text-ink">{fmt.duration(total)}</strong>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <th className="px-4 py-2">{t('entry.date')}</th>
              <th className="px-2 py-2">{t('entry.description')}</th>
              <th className="px-2 py-2">
                {labels.level2} / {labels.level1}
              </th>
              <th className="px-2 py-2">{t('picker.tags')}</th>
              <th className="px-2 py-2">{t('reports.time')}</th>
              <th className="px-4 py-2 text-right">{t('entry.duration')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.slice(0, limit).map((e) => {
              const p = e.projectId ? projects.get(e.projectId) : undefined
              const c = p?.categoryId ? categories.get(p.categoryId) : undefined
              return (
                <tr key={e.id} onClick={() => e.end && setEditing(e)} className="cursor-pointer hover:bg-surface-2">
                  <td className="whitespace-nowrap px-4 py-2 capitalize text-ink-2">{fmt.date(e.start, 'EEE d MMM')}</td>
                  <td className="max-w-[18rem] truncate px-2 py-2 text-ink">{e.description || <span className="text-subtle">{t('timer.noDescription')}</span>}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      <ColorDot color={meta('project', e.projectId ?? NONE).color} />
                      <span className="truncate text-ink">{p?.name ?? '–'}</span>
                      {c && <span className="truncate text-xs text-subtle">· {c.name}</span>}
                    </div>
                  </td>
                  <td className="max-w-[10rem] truncate px-2 py-2 text-muted">{e.tagIds.map((id) => tags.get(id)?.name).filter(Boolean).join(', ')}</td>
                  <td className="tabular whitespace-nowrap px-2 py-2 text-muted">
                    {fmt.time(e.start)} – {e.end ? fmt.time(e.end) : '…'}
                  </td>
                  <td className="tabular px-4 py-2 text-right font-medium text-ink">{fmt.duration(reportSeconds(e, settings, now))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {sorted.length > limit && (
        <div className="flex justify-center border-t border-border p-3">
          <Button size="sm" onClick={() => setLimit((l) => l + 100)}>
            {t('timer.loadMore')}
          </Button>
        </div>
      )}
      <EntryEditor draft={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Weekly / monthly matrix
// ---------------------------------------------------------------------------

function Periodic({ entries, unit, now }: { entries: TimeEntry[]; unit: Unit; now: number }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const labels = useLabels()
  const fmt = useFormat()
  const meta = useGroupMeta()
  const lookup = useLookup()
  const [bucket, setBucket] = useState<Bucket>('week')

  const grid = matrix(entries, bucket, 'project', lookup, settings, now)
  const columns = [...grid.keys()].sort()
  const projectTotals = totalsBy(entries, 'project', lookup, settings, now)

  // Group project rows under their category, categories by total.
  const byCategory = new Map<string, { key: string; seconds: number }[]>()
  for (const p of projectTotals) {
    const project = lookup.projects.get(p.key)
    const cat = project?.categoryId ?? NONE
    byCategory.set(cat, [...(byCategory.get(cat) ?? []), p])
  }

  const colLabel = (key: string) => (bucket === 'week' ? fmt.date(fromDayKey(key), 'd MMM') : fmt.date(fromDayKey(key), 'MMM yy'))
  const cell = (seconds: number) => (seconds ? fmt.value(seconds, unit) : '–')

  if (!entries.length) return <EmptyState title={t('reports.empty')} />

  const total = projectTotals.reduce((s, p) => s + p.seconds, 0)

  return (
    <Card
      title={bucket === 'week' ? t('reports.byWeek') : t('reports.byMonth')}
      action={
        <Segmented
          size="sm"
          value={bucket}
          onChange={(b) => setBucket(b)}
          options={[
            { value: 'week', label: t('reports.weeks') },
            { value: 'month', label: t('reports.months') },
          ]}
        />
      }
    >
      <div className="-mx-4 overflow-x-auto sm:-mx-5">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="bg-surface-2 text-left">
              <th className="px-4 py-2 font-semibold text-ink-2 sm:px-5">
                {labels.level1} / {labels.level2}
              </th>
              {columns.map((c) => (
                <th key={c} className="whitespace-nowrap px-2 py-2 text-right font-semibold capitalize text-ink-2">
                  {colLabel(c)}
                </th>
              ))}
              <th className="px-4 py-2 text-right font-semibold text-ink-2 sm:px-5">{t('common.total')}</th>
            </tr>
          </thead>
          <tbody>
            {[...byCategory.entries()].map(([cat, rows]) => {
              const catMeta = meta('category', cat)
              const catCols = columns.map((c) => rows.reduce((s, r) => s + (grid.get(c)?.get(r.key) ?? 0), 0))
              return (
                <Fragment key={cat}>
                  <tr className="border-t border-border bg-surface-2/50">
                    <td className="px-4 py-2 sm:px-5">
                      <div className="flex items-center gap-2 font-semibold text-ink">
                        <ColorDot color={catMeta.color} />
                        {catMeta.name}
                      </div>
                    </td>
                    {catCols.map((s, i) => (
                      <td key={columns[i]} className="tabular px-2 py-2 text-right font-semibold text-ink">
                        {cell(s)}
                      </td>
                    ))}
                    <td className="tabular px-4 py-2 text-right font-semibold text-ink sm:px-5">{cell(rows.reduce((s, r) => s + r.seconds, 0))}</td>
                  </tr>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-t border-border/60">
                      <td className="py-1.5 pl-9 pr-2 text-ink-2 sm:pl-10">{meta('project', r.key).name}</td>
                      {columns.map((c) => (
                        <td key={c} className="tabular px-2 py-1.5 text-right text-ink-2">
                          {cell(grid.get(c)?.get(r.key) ?? 0)}
                        </td>
                      ))}
                      <td className="tabular px-4 py-1.5 text-right text-ink-2 sm:px-5">{cell(r.seconds)}</td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border-strong">
              <td className="px-4 py-2 font-semibold text-ink-2 sm:px-5">{t('common.total')}</td>
              {columns.map((c) => (
                <td key={c} className="tabular px-2 py-2 text-right font-semibold text-ink">
                  {cell([...(grid.get(c)?.values() ?? [])].reduce((a, b) => a + b, 0))}
                </td>
              ))}
              <td className="tabular px-4 py-2 text-right font-bold text-brand sm:px-5">{cell(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  )
}
