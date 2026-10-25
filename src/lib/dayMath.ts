import { TZDate } from '@date-fns/tz'

export type Range = { startMs: number; endMs: number }
export type Trio = { wallClockMin: number; effortMin: number; premiumMin: number }

const MIN = 60_000

export function assertMinuteAligned(ms: number): void {
  if (!Number.isInteger(ms) || ms % MIN !== 0) throw new RangeError(`not minute-aligned: ${ms}`)
}

export function minutesBetween(startMs: number, endMs: number): number {
  assertMinuteAligned(startMs)
  assertMinuteAligned(endMs)
  return (endMs - startMs) / MIN
}

/** Union of ranges: sorted, non-overlapping, touching ranges merged. Empty ranges dropped. */
export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = ranges.filter((r) => r.endMs > r.startMs).sort((a, b) => a.startMs - b.startMs)
  const out: Range[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r.startMs <= last.endMs) last.endMs = Math.max(last.endMs, r.endMs)
    else out.push({ ...r })
  }
  return out
}

// Wall-clock is the union, effort the sum; premium is the concurrency surplus (#7).
export function computeTrio(ivs: Range[]): Trio {
  const effortMin = ivs.reduce((s, r) => s + minutesBetween(r.startMs, r.endMs), 0)
  const wallClockMin = mergeRanges(ivs).reduce((s, r) => s + minutesBetween(r.startMs, r.endMs), 0)
  return { wallClockMin, effortMin, premiumMin: effortMin - wallClockMin }
}

type Keyed = { workerId: string; jobId: string; startMs: number; endMs: number }

/** Same worker, same job, overlapping in time: the one overlap that is a data error (#7). */
export function findSameJobOverlaps(ivs: Keyed[]): { workerId: string; jobId: string; overlapMs: number }[] {
  const groups = new Map<string, Keyed[]>()
  for (const iv of ivs) {
    const k = `${iv.workerId}|${iv.jobId}`
    groups.set(k, [...(groups.get(k) ?? []), iv])
  }
  const out: { workerId: string; jobId: string; overlapMs: number }[] = []
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.startMs - b.startMs)
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!
      const cur = sorted[i]!
      const overlapMs = Math.min(prev.endMs, cur.endMs) - cur.startMs
      if (overlapMs > 0) out.push({ workerId: cur.workerId, jobId: cur.jobId, overlapMs })
    }
  }
  return out
}

/** Cuts `range` at each boundary strictly inside it; boundaries need not be sorted. */
export function splitRangeAtBoundaries(range: Range, boundariesMs: number[]): Range[] {
  const cuts = [...new Set(boundariesMs)].filter((b) => b > range.startMs && b < range.endMs).sort((a, b) => a - b)
  const out: Range[] = []
  let start = range.startMs
  for (const c of cuts) {
    out.push({ startMs: start, endMs: c })
    start = c
  }
  out.push({ startMs: start, endMs: range.endMs })
  return out
}

const parseIsoDate = (isoDate: string) => isoDate.split('-').map(Number) as [number, number, number]
const pad = (n: number) => String(n).padStart(2, '0')

/** [local midnight, next local midnight) as UTC ms; 23h/25h on DST days. */
export function localDayBoundariesUtcMs(isoDate: string, tz: string): Range {
  const [y, m, d] = parseIsoDate(isoDate)
  const startMs = new TZDate(y, m - 1, d, 0, 0, 0, tz).getTime()
  const endMs = new TZDate(y, m - 1, d + 1, 0, 0, 0, tz).getTime()
  return { startMs, endMs }
}

/** UTC ISO instant of wall time `hhmm` on `isoDate` in `tz`. TZDate's string form would read the host zone (#23). */
export function localInstantIso(isoDate: string, hhmm: string, tz: string): string {
  const [y, m, d] = parseIsoDate(isoDate)
  const [hh, mm] = hhmm.split(':').map(Number) as [number, number]
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, tz).getTime()).toISOString()
}

export function localDateOf(ms: number, tz: string): string {
  const t = new TZDate(ms, tz)
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
}

/** `HH:MM` of an instant in `tz` (#23). */
export function localHHMM(ms: number, tz: string): string {
  const t = new TZDate(ms, tz)
  return `${pad(t.getHours())}:${pad(t.getMinutes())}`
}

/** `YYYY-MM-DD HH:MM` of an instant in `tz` (#23) — audit timestamps. */
export function localDateTimeOf(ms: number, tz: string): string {
  return `${localDateOf(ms, tz)} ${localHHMM(ms, tz)}`
}

/** Human label for a week-start date ('YYYY-MM-DD' Monday) — "Week of 7 Sep". (#P0.4) */
export function formatWeekLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  const short = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date)
  return `Week of ${short}`
}

/** Local-midnight instants inside [startMs, endMs) — the cut points for day attribution. */
export function dayBoundariesWithin(range: Range, tz: string): number[] {
  const out: number[] = []
  let day = localDateOf(range.startMs, tz)
  for (;;) {
    const next = localDayBoundariesUtcMs(day, tz).endMs
    if (next >= range.endMs) return out
    out.push(next)
    day = localDateOf(next, tz)
  }
}
