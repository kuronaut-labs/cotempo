import { localHHMM, type Range } from '~/lib/dayMath'

/* Layout maths for the worked-window day strip (LD4/LD5). Pure, unit-tested;
   `stripBlocks` (rule 10) stays byte-identical — this complements it. */

/** The hour window the strip draws: 06–22 local by default, expanded to whole
    hours to cover any interval, clamped to the day. Empty intervals → the day. */
export function stripWindow(day: Range, intervals: { startMs: number; endMs: number }[], tz: string, defaultStartHour = 6, defaultEndHour = 22): Range {
  let startMin = defaultStartHour * 60
  let endMin = defaultEndHour * 60
  for (const iv of intervals) {
    // intersect with day to ignore neighbours
    const s = Math.max(iv.startMs, day.startMs)
    const e = Math.min(iv.endMs, day.endMs)
    if (e <= s) continue
    const sm = minutesOfDay(s, tz)
    const em = minutesOfDay(e - 1, tz) // last covered minute
    startMin = Math.min(startMin, Math.floor(sm / 60) * 60)
    endMin = Math.max(endMin, Math.ceil(em / 60) * 60)
  }
  const startMs = day.startMs + startMin * 60000
  const endMs = day.startMs + endMin * 60000
  return { startMs: Math.max(day.startMs, startMs), endMs: Math.min(day.endMs, endMs) }
}

/** Greedy row assignment by clippedStart: first row whose last end ≤ this start. */
export function assignRows(blocks: { id: string; clippedStart: number; clippedEnd: number }[]): Map<string, number> {
  const rows: number[] = []
  const out = new Map<string, number>()
  for (const b of blocks) {
    let placed = false
    for (let i = 0; i < rows.length; i++) {
      if (rows[i]! <= b.clippedStart) {
        rows[i] = b.clippedEnd
        out.set(b.id, i)
        placed = true
        break
      }
    }
    if (!placed) {
      rows.push(b.clippedEnd)
      out.set(b.id, rows.length - 1)
    }
  }
  return out
}

/** Hairline ticks across the window, every `everyHours` hours; a label when the
    hour hits the 3h rhythm from the window start (06/09/12 when everyHours=3). */
export function hourTicks(window: Range, tz: string, everyHours = 2): { ms: number; leftPct: number; label: string | null }[] {
  const span = window.endMs - window.startMs
  const out: { ms: number; leftPct: number; label: string | null }[] = []
  for (let m = 0; ; m += everyHours * 60) {
    const ms = window.startMs + m * 60000
    if (ms > window.endMs) break
    const hhmm = localHHMM(ms, tz)
    const [h] = hhmm.split(':').map(Number) as [number, number]
    const labelled = h % 3 === 0
    out.push({ ms, leftPct: span === 0 ? 0 : ((ms - window.startMs) / span) * 100, label: labelled ? hhmm : null })
  }
  return out
}

/** Which legend items the strip needs: only explain glyphs that actually appear. */
export function legendItems(
  blocks: { leadingClip: string; trailingClip: string }[],
  overlapCount: number,
): { leading: boolean; trailing: boolean; overlap: boolean } {
  return {
    leading: blocks.some((b) => b.leadingClip !== ''),
    trailing: blocks.some((b) => b.trailingClip !== ''),
    overlap: overlapCount > 0,
  }
}

function minutesOfDay(ms: number, tz: string): number {
  const hhmm = localHHMM(ms, tz)
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  return h * 60 + m
}
