import { mergeRanges, type Range } from './dayMath'
import type { Piece } from './attribution'

/* Overtime attribution (#overtime): a worker-day's wall clock (unioned, not summed)
   above `dayMinutes` is spread across that day's projects pro-rata by effort. */

export type OvertimeRow = { workerId: string; day: string; wallClockMin: number; overtimeMin: number; attributedMin: number }

export function overtimeByProject(pieces: Piece[], projectJobIds: Set<string>, dayMinutes: number): OvertimeRow[] {
  return overtime(pieces, dayMinutes, (p) => (projectJobIds.has(p.jobId) ? p : null))
}

export function overtimeByJob(pieces: Piece[], jobId: string, dayMinutes: number): OvertimeRow[] {
  return overtime(pieces, dayMinutes, (p) => (p.jobId === jobId ? p : null))
}

function overtime(pieces: Piece[], dayMinutes: number, select: (p: Piece) => Piece | null): OvertimeRow[] {
  if (pieces.length === 0) return []
  const rows: OvertimeRow[] = []
  const byKey = new Map<string, { workerId: string; day: string; ranges: Range[]; selTotal: number; allTotal: number }>()
  for (const p of pieces) {
    const key = `${p.workerId}|${p.day}`
    let cell = byKey.get(key)
    if (!cell) {
      cell = { workerId: p.workerId, day: p.day, ranges: [], selTotal: 0, allTotal: 0 }
      byKey.set(key, cell)
    }
    cell.ranges.push({ startMs: p.startMs, endMs: p.endMs })
    cell.allTotal += (p.endMs - p.startMs) / 60_000
    const picked = select(p)
    if (picked) cell.selTotal += (picked.endMs - picked.startMs) / 60_000
  }
  for (const cell of byKey.values()) {
    const wall = mergeRanges(cell.ranges).reduce((s, r) => s + (r.endMs - r.startMs) / 60_000, 0)
    const ot = Math.max(0, wall - dayMinutes)
    if (ot === 0) continue
    // Single rounding point (#5-adjacent): attribution only, minute math stays exact shape.
    const attributed = cell.allTotal > 0 ? Math.round((ot * cell.selTotal) / cell.allTotal) : 0
    // Zero attribution means the overtime belongs to other work entirely — not this project's row.
    if (attributed === 0) continue
    rows.push({ workerId: cell.workerId, day: cell.day, wallClockMin: Math.round(wall), overtimeMin: ot, attributedMin: attributed })
  }
  rows.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.workerId.localeCompare(b.workerId)))
  return rows
}

export function totalOvertimeMin(rows: OvertimeRow[]): number {
  return rows.reduce((s, r) => s + r.attributedMin, 0)
}
