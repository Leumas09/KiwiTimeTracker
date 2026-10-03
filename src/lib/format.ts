import { format as formatDate } from 'date-fns'
import { useMemo } from 'react'
import { useSettings } from '../data/hooks'
import { dateLocale } from './dates'
import { formatDays, formatDuration, formatNumber } from './duration'

export type Unit = 'hours' | 'days'

/** Formatting helpers bound to the user's preferences. */
export function useFormat() {
  const s = useSettings()
  return useMemo(() => {
    const locale = dateLocale(s.locale)
    return {
      locale: s.locale,
      duration: (seconds: number) => formatDuration(seconds, s.durationFormat, s.locale),
      days: (seconds: number) => formatDays(seconds, s.dayHours, s.locale),
      value: (seconds: number, unit: Unit) =>
        unit === 'days' ? formatDays(seconds, s.dayHours, s.locale) : formatDuration(seconds, s.durationFormat, s.locale),
      /** Plain number for charts and CSV-like cells. */
      amount: (seconds: number, unit: Unit) => (unit === 'days' ? seconds / 3600 / s.dayHours : seconds / 3600),
      number: (value: number, decimals = 2) => formatNumber(value, s.locale, decimals),
      percent: (ratio: number) => `${formatNumber(ratio * 100, s.locale, 0)} %`,
      date: (date: Date | string, pattern: string) => formatDate(typeof date === 'string' ? new Date(date) : date, pattern, { locale }),
      time: (date: Date | string) => formatDate(typeof date === 'string' ? new Date(date) : date, 'HH:mm', { locale }),
    }
  }, [s.locale, s.durationFormat, s.dayHours])
}
