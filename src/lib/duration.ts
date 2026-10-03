import type { DurationFormat, Locale, RoundingMode } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

/** HH:MM:SS, used for the running timer whatever the preference. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

export function formatDuration(totalSeconds: number, format: DurationFormat, locale: Locale): string {
  const s = Math.max(0, Math.round(totalSeconds))
  if (format === 'clock') return formatClock(s)
  if (format === 'decimal') {
    return `${formatNumber(s / 3600, locale, 2)} h`
  }
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0) return locale === 'fr' ? `${m} min` : `${m}m`
  return locale === 'fr' ? `${h} h ${pad(m)}` : `${h}h ${pad(m)}m`
}

/** Days with the user's day length, e.g. "2,5 j" / "2.5 d". */
export function formatDays(totalSeconds: number, dayHours: number, locale: Locale): string {
  const days = totalSeconds / 3600 / dayHours
  return `${formatNumber(days, locale, days < 10 ? 2 : 1)} ${locale === 'fr' ? 'j' : 'd'}`
}

export function formatNumber(value: number, locale: Locale, maxDecimals = 2): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: 0,
  }).format(value)
}

/**
 * Parses a duration typed by the user and returns seconds, or null.
 * A bare number is hours ("2", "1,5"). Also accepts "1:30", "1:30:15",
 * "1h30", "1 h 30", "90m", "90 min", "2h".
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase().replace(',', '.')
  if (!text) return null

  const clock = text.match(/^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/)
  if (clock) return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3] ?? 0)

  const hours = text.match(/^(\d+(?:\.\d+)?)$/)
  if (hours) return Math.round(Number(hours[1]) * 3600)

  const hm = text.match(/^(\d+(?:\.\d+)?)\s*h\s*(?:(\d{1,2})\s*(?:m|min|mn)?)?$/)
  if (hm) return Math.round(Number(hm[1]) * 3600 + Number(hm[2] ?? 0) * 60)

  const minutes = text.match(/^(\d+)\s*(?:m|min|mn)$/)
  if (minutes) return Number(minutes[1]) * 60

  return null
}

/**
 * Parses a time of day ("9", "930", "9:30", "14h30", "9.30") into minutes since midnight.
 */
export function parseTimeOfDay(input: string): number | null {
  const text = input.trim().toLowerCase()
  let h: number
  let m: number
  const sep = text.match(/^(\d{1,2})\s*[:h.]\s*(\d{1,2})?$/)
  if (sep) {
    h = Number(sep[1])
    m = Number(sep[2] ?? 0)
  } else if (/^\d{1,4}$/.test(text)) {
    if (text.length <= 2) {
      h = Number(text)
      m = 0
    } else {
      h = Number(text.slice(0, text.length - 2))
      m = Number(text.slice(-2))
    }
  } else {
    return null
  }
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

export function roundSeconds(seconds: number, minutes: number, mode: RoundingMode): number {
  if (!minutes) return seconds
  const step = minutes * 60
  const fn = mode === 'up' ? Math.ceil : mode === 'down' ? Math.floor : Math.round
  return fn(seconds / step) * step
}
