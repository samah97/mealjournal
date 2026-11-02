/**
 * Dates are stored as local calendar dates (YYYY-MM-DD) and wall-clock times
 * (HH:mm) in the diary's configured time zone. That keeps entries stable across
 * DST changes and travel, which is what a food diary needs.
 */

export const DEFAULT_TIME_ZONE = 'Europe/Amsterdam'

export function nowInZone(timeZone: string, at: Date = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

export function todayInZone(timeZone: string): string {
  return nowInZone(timeZone).date
}

function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 12))
}

export function addDays(date: string, days: number): string {
  const d = parseDate(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Inclusive list of dates from start to end. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = []
  if (end < start) return out
  for (let d = start; d <= end && out.length < 1000; d = addDays(d, 1)) out.push(d)
  return out
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000)
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' })

/** "Monday 3 November 2026" */
export function formatLongDate(date: string): string {
  return fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(parseDate(date))
}

/** "Mon 3 Nov" */
export function formatShortDate(date: string): string {
  return fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(parseDate(date))
}

/** "3 Nov 2026" */
export function formatMediumDate(date: string): string {
  return fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(parseDate(date))
}

export function formatWeekday(date: string): string {
  return fmt({ weekday: 'long' }).format(parseDate(date))
}

export function formatPeriod(start: string, end: string): string {
  if (start === end) return formatMediumDate(start)
  return `${formatMediumDate(start)} – ${formatMediumDate(end)}`
}

/** Today / Yesterday / weekday name for recent dates, otherwise a short date. */
export function relativeDayLabel(date: string, today: string): string {
  const diff = diffDays(date, today)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff === -1) return 'Tomorrow'
  return formatShortDate(date)
}

export function greeting(time: string): string {
  const h = Number(time.slice(0, 2))
  if (h < 5) return 'Good evening'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function isValidDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(parseDate(v).getTime())
}

export function isValidTime(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
}

export function formatTimestamp(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms))
}
