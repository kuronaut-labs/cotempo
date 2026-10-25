import { localDateOf, localDayBoundariesUtcMs, type Range } from './dayMath'

const DAY = 86_400_000
const parse = (iso: string) => iso.split('-').map(Number) as [number, number, number]
const toIso = (utcMs: number) => new Date(utcMs).toISOString().slice(0, 10)

/** ISO Monday ('YYYY-MM-DD') of the local date `ms` falls on in `tz` (#23). */
export function isoWeekStart(ms: number, tz: string): string {
  const [y, m, d] = parse(localDateOf(ms, tz))
  const date = new Date(Date.UTC(y, m - 1, d))
  const dow = date.getUTCDay()
  date.setUTCDate(date.getUTCDate() - (dow === 0 ? 6 : dow - 1))
  return toIso(date.getTime())
}

export function weekDates(weekStartIso: string): string[] {
  const [y, m, d] = parse(weekStartIso)
  const base = Date.UTC(y, m - 1, d)
  return Array.from({ length: 7 }, (_, i) => toIso(base + i * DAY))
}

/** [Monday 00:00, next Monday 00:00) local, as UTC ms; 167h or 169h across a DST change (#23). */
export function weekBoundariesUtcMs(weekStartIso: string, tz: string): Range {
  return {
    startMs: localDayBoundariesUtcMs(weekStartIso, tz).startMs,
    endMs: localDayBoundariesUtcMs(weekDates(weekStartIso)[6]!, tz).endMs,
  }
}

export function isMonday(isoDate: string): boolean {
  const [y, m, d] = parse(isoDate)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1
}

// endMs is exclusive, so a range ending exactly at Monday 00:00 touches one week (#26).
export function weekKeysTouched(range: Range, tz: string): string[] {
  const last = isoWeekStart(range.endMs - 1, tz)
  const out = [isoWeekStart(range.startMs, tz)]
  while (out[out.length - 1]! < last) {
    const [y, m, d] = parse(out[out.length - 1]!)
    out.push(toIso(Date.UTC(y, m - 1, d + 7)))
  }
  return out
}
