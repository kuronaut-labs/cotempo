import type { Range } from '~/lib/dayMath'

export type StripInterval = { id: string; jobId: string; startMs: number; endMs: number }

export type StripBlock = {
  id: string
  jobId: string
  startMs: number
  endMs: number
  /** Range after clipping to [day.startMs, day.endMs). May be empty. */
  clippedStart: number
  clippedEnd: number
  /** `'‹'` if the interval started before the day, `'>'` if it ends after, `''` otherwise. */
  leadingClip: '‹' | '›' | ''
  trailingClip: '‹' | '›' | ''
  /** Position of the block inside the day bar as 0..100 percent. */
  leftPct: number
  widthPct: number
}

export type OverlapRegion = { startMs: number; endMs: number; count: number; leftPct: number; widthPct: number }

export type StripLayout = {
  blocks: StripBlock[]
  overlaps: OverlapRegion[]
}

const pct = (ms: number, spanMs: number) => (ms / spanMs) * 100

/** Layout for a 24-hour (or any-span) day strip. Pure: same input → same output, no DOM, no tz. */
export function stripBlocks(day: Range, intervals: StripInterval[]): StripLayout {
  if (day.endMs <= day.startMs) return { blocks: [], overlaps: [] }
  const span = day.endMs - day.startMs

  // Per-interval clip + position.
  const blocks: StripBlock[] = []
  for (const iv of intervals) {
    const clippedStart = Math.max(iv.startMs, day.startMs)
    const clippedEnd = Math.min(iv.endMs, day.endMs)
    if (clippedEnd <= clippedStart) continue
    blocks.push({
      id: iv.id,
      jobId: iv.jobId,
      startMs: iv.startMs,
      endMs: iv.endMs,
      clippedStart,
      clippedEnd,
      leadingClip: iv.startMs < day.startMs ? '‹' : '',
      trailingClip: iv.endMs > day.endMs ? '›' : '',
      leftPct: pct(clippedStart - day.startMs, span),
      widthPct: pct(clippedEnd - clippedStart, span),
    })
  }
  blocks.sort((a, b) => a.clippedStart - b.clippedStart || a.id.localeCompare(b.id))

  // Overlap regions via a sweep: events at every clip boundary track active count.
  const overlaps: OverlapRegion[] = []
  if (blocks.length === 0) return { blocks, overlaps }

  // Build (ms, delta) events from clipped intervals.
  const events: Array<{ ms: number; delta: number; id: string }> = []
  for (const b of blocks) {
    events.push({ ms: b.clippedStart, delta: 1, id: b.id })
    events.push({ ms: b.clippedEnd, delta: -1, id: b.id })
  }
  // Resolve ties so a zero-length block ending at X doesn't cancel an opening at X.
  events.sort((a, b) => a.ms - b.ms || a.delta - b.delta || a.id.localeCompare(b.id))

  let active = 0
  let runStart = events[0]!.ms
  let runCount = 0
  for (const ev of events) {
    if (ev.ms !== runStart && runCount > 1) {
      const prev = overlaps[overlaps.length - 1]
      // Merge only when both ends touch and the count is the same — otherwise the
      // peak-count region is a distinct island (e.g. two overlap, then three, then two).
      if (prev && prev.endMs === runStart && prev.count === runCount) {
        prev.endMs = ev.ms
        prev.widthPct = pct(ev.ms - runStart, span)
      } else {
        overlaps.push({
          startMs: runStart,
          endMs: ev.ms,
          count: runCount,
          leftPct: pct(runStart - day.startMs, span),
          widthPct: pct(ev.ms - runStart, span),
        })
      }
    }
    if (ev.delta > 0) {
      active += ev.delta
      runStart = ev.ms
      runCount = active
    } else {
      active += ev.delta
      runStart = ev.ms
      runCount = active
    }
  }
  return { blocks, overlaps }
}

export function MiniStrip({
  day,
  intervals,
  jobColorIndex,
}: {
  day: Range
  intervals: StripInterval[]
  /** Maps `jobId` → 1..5 → CSS class `.job-c{n}`. Missing jobs fall back to `--line`. */
  jobColorIndex: Record<string, number>
}) {
  const { blocks, overlaps } = stripBlocks(day, intervals)
  return (
    <div className="ministrip" role="img" aria-label="Day timeline">
      <div className="ministrip-track">
        {blocks.map((b) => {
          const n = jobColorIndex[b.jobId]
          const colorClass = n ? `job-c${Math.min(5, Math.max(1, n))}` : ''
          const style = colorClass ? undefined : { background: 'var(--line)', color: 'var(--text)' }
          return (
            <div
              key={b.id}
              className={`ministrip-block ${colorClass}`}
              style={{ left: `${b.leftPct}%`, width: `${b.widthPct}%`, ...style }}
              title={`${b.leadingClip}${new Date(b.clippedStart).toISOString().slice(11, 16)}–${new Date(b.clippedEnd).toISOString().slice(11, 16)}${b.trailingClip}`}
            >
              {b.leadingClip}
              {b.trailingClip}
            </div>
          )
        })}
        {overlaps.map((o, i) => (
          <div key={i} className="ministrip-overlap" style={{ left: `${o.leftPct}%`, width: `${o.widthPct}%` }}>
            <span className="ministrip-overlap-tag">×{o.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
