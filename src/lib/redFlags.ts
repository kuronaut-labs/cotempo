import { groupBy, type Piece } from './attribution'
import { localDateOf } from './dayMath'
import { localDayBoundariesUtcMs, mergeRanges, type Range } from './dayMath'
import { weekDates } from './week'

export type FlagKind = 'gap' | 'late_entry' | 'multi_edit' | 'retroactive' | 'non_supervisor'
export type Flag = { kind: FlagKind; intervalId?: string; day?: string; detail: string }

export const defaults = { gapMinWallMin: 8 * 60, lateEntryDays: 7, multiEditOver: 2 }
export type FlagConfig = typeof defaults

export type RedFlagInput = {
  weekStart: string
  tz: string
  worker: { id: string; supervisorId: string | null }
  intervals: { id: string; startedAt: number; endedAt: number; createdAt: number; editCount: number; createdBy: string }[]
  pieces: Piece[]
}

const DAY = 86_400_000

/* Per-day wall-clock across the worker's pieces on that local day, UNIONED like
   recon() (attribution's explode does NOT resolve concurrency — pieces overlap,
   so summing them would overcount on concurrent-coverage days). */
function wallMinByDay(pieces: Piece[], workerId: string): Map<string, number> {
  const byDay = new Map<string, Range[]>()
  for (const p of pieces) {
    if (p.workerId !== workerId) continue
    const ranges = byDay.get(p.day) ?? []
    ranges.push({ startMs: p.startMs, endMs: p.endMs })
    byDay.set(p.day, ranges)
  }
  const out = new Map<string, number>()
  for (const [day, ranges] of byDay) {
    out.set(day, mergeRanges(ranges).reduce((s, r) => s + (r.endMs - r.startMs) / 60_000, 0))
  }
  return out
}

/* gap: a Mon–Fri day in the week with no time or wall-clock < gapMinWallMin (#12, #17). */
function gapFlags(input: RedFlagInput, cfg: FlagConfig): Flag[] {
  const dates = weekDates(input.weekStart).slice(0, 5) // Mon..Fri
  const walls = wallMinByDay(input.pieces, input.worker.id)
  const out: Flag[] = []
  for (const day of dates) {
    const wall = walls.get(day) ?? 0
    if (wall < cfg.gapMinWallMin) {
      out.push({
        kind: 'gap',
        day,
        detail: wall === 0 ? `No time logged on ${day}.` : `Only ${Math.round(wall)} min on ${day} (< 8h).`,
      })
    }
  }
  return out
}

/* late_entry: createdAt > end-of-week + lateEntryDays (#17). */
function lateEntryFlags(input: RedFlagInput, cfg: FlagConfig): Flag[] {
  // end of weekStart is the start of Tuesday; add 6 days to reach end-of-Sunday
  // (which is the same as Monday-next-week 00:00 local).
  const startOfWeek: Range = localDayBoundariesUtcMs(input.weekStart, input.tz)
  const endOfWeek = startOfWeek.endMs + 6 * DAY
  const deadline = endOfWeek + cfg.lateEntryDays * DAY
  const out: Flag[] = []
  for (const iv of input.intervals) {
    if (iv.createdAt > deadline) {
      out.push({ kind: 'late_entry', intervalId: iv.id, detail: `Interval ${iv.id} entered after the late-entry window.` })
    }
  }
  return out
}

/* multi_edit: editCount > multiEditOver. */
function multiEditFlags(input: RedFlagInput, cfg: FlagConfig): Flag[] {
  const out: Flag[] = []
  for (const iv of input.intervals) {
    if (iv.editCount > cfg.multiEditOver) {
      out.push({ kind: 'multi_edit', intervalId: iv.id, detail: `Interval ${iv.id} edited ${iv.editCount} times.` })
    }
  }
  return out
}

/* retroactive: the interval was created on a later local day than it started (#17). */
function retroactiveFlags(input: RedFlagInput): Flag[] {
  const out: Flag[] = []
  for (const iv of input.intervals) {
    const c = localDateOf(iv.createdAt, input.tz)
    const s = localDateOf(iv.startedAt, input.tz)
    if (c > s) {
      out.push({ kind: 'retroactive', intervalId: iv.id, detail: `Interval ${iv.id} created ${c} but started ${s}.` })
    }
  }
  return out
}

/* non_supervisor: createdBy is neither the worker nor their supervisor (#12, #17). */
function nonSupervisorFlags(input: RedFlagInput): Flag[] {
  const allowed = new Set([input.worker.id, input.worker.supervisorId].filter(Boolean) as string[])
  const out: Flag[] = []
  for (const iv of input.intervals) {
    if (!allowed.has(iv.createdBy)) {
      out.push({ kind: 'non_supervisor', intervalId: iv.id, detail: `Interval ${iv.id} entered by ${iv.createdBy}.` })
    }
  }
  return out
}

/* Order matches the contract tests' `kinds(...)` arrays: gap, late_entry, multi_edit,
   retroactive, non_supervisor. Add a new check at the end and extend the contract
   rather than re-ordering, so the existing assertions stay stable. */
export function redFlags(input: RedFlagInput, cfg: FlagConfig = defaults): Flag[] {
  void groupBy // kept to ensure attribution stays the canonical grouping helper
  return [
    ...gapFlags(input, cfg),
    ...lateEntryFlags(input, cfg),
    ...multiEditFlags(input, cfg),
    ...retroactiveFlags(input),
    ...nonSupervisorFlags(input),
  ]
}
