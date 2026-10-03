import { subDays } from 'date-fns'
import { Target } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useEntries, useLabels, useLookup, useSettings } from '../data/hooks'
import { useFormat } from '../lib/format'
import {
  budgetLevel,
  budgetSeconds,
  entriesForTarget,
  goalSeconds,
  inRange,
  periodRange,
  projectExhaustion,
  sumSeconds,
} from '../lib/stats'
import { useColor } from '../lib/theme'
import type { Category, Project } from '../lib/types'
import { ColorDot, EmptyState, ProgressBar, Spinner } from './ui'

type Item = { kind: 'category'; item: Category } | { kind: 'project'; item: Project }

/** Budgets (total, in days) and recurring goals for both levels. */
export function Targets({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const labels = useLabels()
  const fmt = useFormat()
  const color = useColor()
  const { categoryList, projectList, projects, categories } = useLookup()

  const items: Item[] = useMemo(
    () => [
      ...categoryList.filter((c) => !c.archivedAt && (c.budgetDays || c.goalAmount)).map((item) => ({ kind: 'category' as const, item })),
      ...projectList.filter((p) => !p.archivedAt && (p.budgetDays || p.goalAmount)).map((item) => ({ kind: 'project' as const, item })),
    ],
    [categoryList, projectList],
  )

  const { data: entries, isLoading } = useEntries(null, items.length > 0)

  if (!items.length) {
    return compact ? (
      <p className="text-sm text-muted">{t('targets.none', { level: labels.level2Plural })}</p>
    ) : (
      <EmptyState icon={<Target size={32} />} title={t('targets.emptyTitle')}>
        {t('targets.none', { level: labels.level2Plural })}
      </EmptyState>
    )
  }
  if (isLoading || !entries) return <Spinner />

  const now = new Date()
  const rows = items.map(({ kind, item }) => {
    const own = entriesForTarget(entries, kind, item.id, projects)
    const budget = budgetSeconds(item, settings.dayHours)
    const used = sumSeconds(own, settings)
    const goal = goalSeconds(item, settings.dayHours)
    const period = item.goalPeriod ? periodRange(item.goalPeriod, now, settings.weekStart) : null
    const previous = item.goalPeriod ? periodRange(item.goalPeriod, subDays(period!.from, 1), settings.weekStart) : null
    const inPeriod = period ? sumSeconds(own.filter((e) => inRange(e, period)), settings) : 0
    const inPrevious = previous ? sumSeconds(own.filter((e) => inRange(e, previous)), settings) : 0
    const eta = budget ? projectExhaustion(own, budget - used, settings, now) : null
    return { kind, item, budget, used, goal, inPeriod, inPrevious, eta }
  })

  const unit = (u: 'hours' | 'days' | null) => (u === 'days' ? 'days' : 'hours')

  return (
    <ul className={compact ? 'flex flex-col gap-4' : 'grid gap-3 md:grid-cols-2'}>
      {rows.map(({ kind, item, budget, used, goal, inPeriod, inPrevious, eta }) => {
        const parent = kind === 'project' && (item as Project).categoryId ? categories.get((item as Project).categoryId!) : undefined
        return (
          <li key={item.id} className={compact ? '' : 'rounded-xl border border-border bg-surface p-4'}>
            <div className="mb-2 flex items-center gap-2">
              <ColorDot color={color(item.color)} />
              <span className="truncate font-medium text-ink">{item.name}</span>
              <span className="truncate text-xs text-subtle">
                {kind === 'category' ? labels.level1 : parent ? `${labels.level2} · ${parent.name}` : labels.level2}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {budget && (
                <div>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-muted">{t('targets.budget')}</span>
                    <span className="tabular text-ink">
                      <strong>{fmt.days(used)}</strong> / {fmt.days(budget)} · {fmt.percent(used / budget)}
                    </span>
                  </div>
                  <ProgressBar ratio={used / budget} level={budgetLevel(used / budget)} label={`${item.name} ${t('targets.budget')}`} />
                  <div className="mt-1 text-xs text-subtle">
                    {used >= budget
                      ? t('targets.over', { amount: fmt.days(used - budget) })
                      : t('targets.remaining', { amount: fmt.days(budget - used) })}
                    {!compact && eta && ` · ${t('targets.eta', { date: fmt.date(eta, 'd MMM yyyy') })}`}
                  </div>
                </div>
              )}
              {goal && item.goalPeriod && (
                <div>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-muted">{t(item.goalPeriod === 'week' ? 'targets.goalWeek' : 'targets.goalMonth')}</span>
                    <span className="tabular text-ink">
                      <strong>{fmt.value(inPeriod, unit(item.goalUnit))}</strong> / {fmt.value(goal, unit(item.goalUnit))}
                    </span>
                  </div>
                  <ProgressBar ratio={inPeriod / goal} level="ok" label={`${item.name} ${t('targets.goal')}`} />
                  {!compact && (
                    <div className="mt-1 text-xs text-subtle">
                      {t(item.goalPeriod === 'week' ? 'targets.previousWeek' : 'targets.previousMonth', {
                        amount: fmt.value(inPrevious, unit(item.goalUnit)),
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
