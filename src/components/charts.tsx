import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ColorDot } from './ui'

export interface Series {
  key: string
  name: string
  color: string
}

interface TooltipProps {
  active?: boolean
  label?: ReactNode
  payload?: TooltipContentProps<number, string>['payload']
  series: Series[]
  formatValue: (value: number) => string
  total?: boolean
}

function ChartTooltip({ active, label, payload, series, formatValue, total = true }: TooltipProps) {
  const { t } = useTranslation()
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => Number(p.value) > 0).reverse()
  const sum = rows.reduce((s, p) => s + Number(p.value), 0)
  if (!rows.length) return null
  const byKey = new Map(series.map((s) => [s.key, s]))
  return (
    <div className="min-w-44 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      {label && <div className="mb-1.5 font-semibold capitalize text-ink">{label}</div>}
      {rows.map((p) => {
        const s = byKey.get(String(p.dataKey ?? p.name))
        return (
          <div key={String(p.dataKey ?? p.name)} className="flex items-center gap-2 py-0.5">
            <ColorDot color={s?.color ?? String(p.color)} />
            <span className="truncate text-ink-2">{s?.name ?? p.name}</span>
            <span className="tabular ml-auto pl-3 font-medium text-ink">{formatValue(Number(p.value))}</span>
          </div>
        )
      })}
      {total && rows.length > 1 && (
        <div className="mt-1 flex border-t border-border pt-1 font-semibold text-ink">
          <span>{t('common.total')}</span>
          <span className="tabular ml-auto">{formatValue(sum)}</span>
        </div>
      )}
    </div>
  )
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <ColorDot color={s.color} />
          {s.name}
        </li>
      ))}
    </ul>
  )
}

/**
 * Stacked bars over time (days, weeks or months). Values are hours or days;
 * `formatValue` renders them for the axis and tooltip.
 */
export function StackedBars({
  data,
  series,
  formatValue,
  formatAxis,
  height = 240,
}: {
  data: Record<string, number | string>[]
  series: Series[]
  formatValue: (value: number) => string
  formatAxis: (value: number) => string
  height?: number
}) {
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border-strong)' }} tick={{ fill: 'var(--muted)', fontSize: 12 }} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--subtle)', fontSize: 11 }} tickFormatter={formatAxis} width={48} allowDecimals />
            <Tooltip
              cursor={{ fill: 'var(--surface-3)', opacity: 0.6 }}
              content={(props) => <ChartTooltip {...props} label={props.payload?.[0]?.payload?.tooltipLabel ?? props.label} series={series} formatValue={formatValue} />}
            />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} stackId="a" fill={s.color} stroke="var(--surface)" strokeWidth={2} radius={[4, 4, 4, 4]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {series.length > 1 && <Legend series={series} />}
    </div>
  )
}

export function Donut({
  data,
  formatValue,
  center,
}: {
  data: (Series & { value: number })[]
  formatValue: (value: number) => string
  center?: ReactNode
}) {
  return (
    <div className="relative h-56">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={0} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.color} />
            ))}
          </Pie>
          <Tooltip content={(props) => <ChartTooltip {...props} series={data} formatValue={formatValue} total={false} />} />
        </PieChart>
      </ResponsiveContainer>
      {center && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
    </div>
  )
}
