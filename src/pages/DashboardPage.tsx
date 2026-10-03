import { endOfMonth, startOfMonth } from 'date-fns'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { StackedBars, type Series } from '../components/charts'
import { Targets } from '../components/Targets'
import { Card, EmptyState, PageHeader } from '../components/ui'
import { useEntries, useLookup, useNow, useRunningEntry, useSettings } from '../data/hooks'
import { dayKey, daysOf, presetRange } from '../lib/dates'
import { useFormat } from '../lib/format'
import { foldKeys, OTHER, useGroupMeta } from '../lib/series'
import { inRange, NONE, reportSeconds, sumSeconds, totalsBy } from '../lib/stats'

export function DashboardPage() {
  const { t } = useTranslation()
  const settings = useSettings()
  const fmt = useFormat()
  const meta = useGroupMeta()
  const lookup = useLookup()
  const { data: running } = useRunningEntry()
  const now = useNow(30_000, !!running)
  const today = dayKey(new Date())

  // One query covering the month and the current week (which may start in the previous month).
  const ranges = useMemo(() => {
    const week = presetRange('thisWeek', settings.weekStart)
    const month = { from: startOfMonth(new Date()), to: endOfMonth(new Date()) }
    const day = presetRange('today', settings.weekStart)
    return { week, month, day, query: { from: week.from < month.from ? week.from : month.from, to: week.to > month.to ? week.to : month.to } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, settings.weekStart])

  const { data: fetched = [] } = useEntries(ranges.query)
  const entries = useMemo(() => {
    const closed = fetched.filter((e) => e.end)
    return running ? [...closed, running] : closed
  }, [fetched, running])

  const sum = (range: { from: Date; to: Date }) => sumSeconds(entries.filter((e) => inRange(e, range)), settings, now)
  const todayTotal = sum(ranges.day)
  const weekTotal = sum(ranges.week)
  const monthTotal = sum(ranges.month)

  const weekEntries = entries.filter((e) => inRange(e, ranges.week))
  const projectTotals = totalsBy(weekEntries, 'project', lookup, settings, now)
  const { keep, folded } = foldKeys(projectTotals)
  const keyOf = (projectKey: string) => (keep.has(projectKey) ? projectKey : OTHER)

  const series: Series[] = [...projectTotals.filter((p) => keep.has(p.key)).map((p) => p.key), ...(folded ? [OTHER] : [])].map((key) => ({
    key,
    ...meta('project', key),
  }))

  const chartData = daysOf(ranges.week).map((d) => {
    const row: Record<string, number | string> = { label: fmt.date(d, 'EEE'), tooltipLabel: fmt.date(d, 'EEEE d MMMM') }
    for (const s of series) row[s.key] = 0
    for (const e of weekEntries) {
      if (dayKey(e.start) !== dayKey(d)) continue
      const k = keyOf(e.projectId ?? NONE)
      row[k] = (row[k] as number) + reportSeconds(e, settings, now) / 3600
    }
    return row
  })

  const name = settings.displayName.split(' ')[0]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={name ? t('dashboard.hello', { name }) : t('nav.dashboard')} />

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: t('time.today'), value: todayTotal },
          { label: t('time.thisWeek'), value: weekTotal },
          { label: t('time.thisMonth'), value: monthTotal },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-border bg-surface p-3 sm:p-4">
            <div className="text-xs font-medium text-muted sm:text-sm">{kpi.label}</div>
            <div className="tabular mt-1 font-display text-xl font-semibold text-ink sm:text-3xl">{fmt.duration(kpi.value)}</div>
            <div className="tabular mt-0.5 text-xs text-subtle">{fmt.days(kpi.value)}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t('dashboard.week')} className="lg:col-span-2">
          {weekTotal > 0 ? (
            <StackedBars
              data={chartData}
              series={series}
              formatValue={(h) => fmt.duration(h * 3600)}
              formatAxis={(h) => `${fmt.number(h, 1)} h`}
            />
          ) : (
            <EmptyState title={t('dashboard.emptyWeek')}>
              <Link to="/timer" className="font-medium text-brand-strong underline">
                {t('dashboard.startTracking')}
              </Link>
            </EmptyState>
          )}
        </Card>

        <Card title={t('dashboard.topProjects')}>
          {projectTotals.length ? (
            <ul className="flex flex-col gap-3">
              {projectTotals.slice(0, 6).map((p) => {
                const m = meta('project', p.key)
                return (
                  <li key={p.key}>
                    <div className="mb-1 flex items-center gap-2 text-sm">
                      <span className="truncate text-ink">{m.name}</span>
                      <span className="tabular ml-auto font-medium text-ink">{fmt.duration(p.seconds)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-3">
                      <div className="h-full rounded-full" style={{ width: `${(p.seconds / projectTotals[0].seconds) * 100}%`, background: m.color }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t('dashboard.noData')}</p>
          )}
        </Card>
      </div>

      <Card
        title={t('targets.title')}
        action={
          <Link to="/reports?tab=targets" className="text-sm font-medium text-brand-strong hover:underline">
            {t('dashboard.details')}
          </Link>
        }
      >
        <Targets compact />
      </Card>
    </div>
  )
}
