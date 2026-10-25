import { useState } from 'react'
import { localHHMM, type Range } from '~/lib/dayMath'
import { assignRows, hourTicks, legendItems, stripWindow } from '~/lib/stripLayout'

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
        // Width spans the entire merged region (prev.startMs..ev.ms), not just
        // the extension. Measuring from runStart (the merge point) was the
        // pre-wave-3 bug — it rendered merged regions at extension-only width.
        prev.widthPct = pct(ev.ms - prev.startMs, span)
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
    active += ev.delta
    runStart = ev.ms
    runCount = active
  }
  return { blocks, overlaps }
}

/** Accessible label for the role=img timeline: role=img collapses every child
 *  for AT, so the entries' data is carried here instead (critique Sam finding). */
export function stripAltText(
  blocks: StripBlock[],
  overlaps: OverlapRegion[],
  jobNames: Record<string, string> | undefined,
  tz: string,
): string {
  if (blocks.length === 0) return 'Day timeline — nothing logged'
  const peak = Math.max(0, ...overlaps.map((o) => o.count))
  const entries = blocks.map((b) => {
    const name = jobNames?.[b.jobId] ?? 'Entry'
    const clip =
      b.leadingClip !== ''
        ? ', starts before this day'
        : b.trailingClip !== ''
          ? ', ends after this day'
          : ''
    return `${name} ${localHHMM(b.clippedStart, tz)}–${localHHMM(b.clippedEnd, tz)}${clip}`
  })
  const overlap = peak > 1 ? `, ${peak} entries overlap` : ''
  return `Day timeline, ${blocks.length} ${blocks.length === 1 ? 'entry' : 'entries'}: ${entries.join('; ')}${overlap}`
}

export function MiniStrip({
  day,
  tz,
  intervals,
  jobColorIndex,
  jobNames,
  highlightId,
  onHover,
  onRangeSelect,
}: {
  day: Range
  tz: string
  intervals: StripInterval[]
  /** Maps `jobId` → 1..5 → CSS class `.job-c{n}`. Missing jobs fall back to `--line`. */
  jobColorIndex: Record<string, number>
  /** Optional `jobId` → display name; used for in-block labels and tooltips. */
  jobNames?: Record<string, string>
  /** When set, that block gets a `.is-hover` outline (row↔block hover linkage). */
  highlightId?: string | null
  onHover?: (id: string | null) => void
  /** Optional drag-to-prefill (LD13): fires with the snapped range on release. */
  onRangeSelect?: (range: Range) => void
}) {
  const window = stripWindow(day, intervals, tz)
  const { blocks, overlaps } = stripBlocks(window, intervals)
  const rows = assignRows(blocks)
  const ticks = hourTicks(window, tz)
  const trackHeight = Math.max(56, rows.size ? (Math.max(...rows.values()) + 1) * 24 + 8 : 32)
  const [selection, setSelection] = useState<{ startMs: number; endMs: number } | null>(null)

  const msAt = (track: HTMLElement, clientX: number): number => {
    const rect = track.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const ms = window.startMs + frac * (window.endMs - window.startMs)
    return window.startMs + Math.round((ms - window.startMs) / 300_000) * 300_000
  }

  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    const track = e.currentTarget
    const start = msAt(track, e.clientX)
    setSelection({ startMs: start, endMs: start })
    track.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => setSelection({ startMs: start, endMs: msAt(track, ev.clientX) })
    const up = (ev: PointerEvent) => {
      track.removeEventListener('pointermove', move)
      track.removeEventListener('pointerup', up)
      const end = msAt(track, ev.clientX)
      setSelection(null)
      if (end !== start) onRangeSelect?.(end > start ? { startMs: start, endMs: end } : { startMs: end, endMs: start })
    }
    track.addEventListener('pointermove', move)
    track.addEventListener('pointerup', up)
  }

  const selectionStyle = selection
    ? {
        left: `${((Math.min(selection.startMs, selection.endMs) - window.startMs) / (window.endMs - window.startMs)) * 100}%`,
        width: `${(Math.abs(selection.endMs - selection.startMs) / (window.endMs - window.startMs)) * 100}%`,
      }
    : undefined

  const tip = (b: StripBlock) => {
    const name = jobNames?.[b.jobId]
    const time = `${b.leadingClip}${localHHMM(b.clippedStart, tz)}–${localHHMM(b.clippedEnd, tz)}${b.trailingClip}`
    return name ? `${name} · ${time}` : time
  }

  return (
    <div
      className="ministrip"
      role="img"
      aria-label={stripAltText(blocks, overlaps, jobNames, tz)}
    >
      {overlaps.length > 0 && (
        <div className="ministrip-tags" aria-hidden>
          {overlaps.map((o, i) => (
            <span key={i} className="ministrip-overlap-tag" style={{ left: `${o.leftPct}%` }}>
              ×{o.count}
            </span>
          ))}
        </div>
      )}
      <div
        className="ministrip-track"
        style={{ height: trackHeight }}
        onPointerDown={onRangeSelect ? drag : undefined}
      >
        {selection && onRangeSelect ? <div className="ministrip-select" style={selectionStyle} /> : null}
        {ticks.map((t, i) => (
          <div key={i} className="ministrip-tick" style={{ left: `${t.leftPct}%` }} />
        ))}
        {overlaps.map((o, i) => (
          <div key={i} className="ministrip-overlap" style={{ left: `${o.leftPct}%`, width: `${o.widthPct}%` }} />
        ))}
        {blocks.map((b) => {
          const n = jobColorIndex[b.jobId]
          const colorClass = n ? `job-c${Math.min(5, Math.max(1, n))}` : ''
          const row = rows.get(b.id) ?? 0
          const style = colorClass
            ? { top: row * 24, height: 22 }
            : { top: row * 24, height: 22, background: 'var(--color-tertiary)', color: 'var(--color-primary)' }
          return (
            <div
              key={b.id}
              data-tip={tip(b)}
              className={`ministrip-block${colorClass ? ` ${colorClass}` : ''}${highlightId === b.id ? ' is-hover' : ''}`}
              style={{ left: `${b.leftPct}%`, width: `${b.widthPct}%`, ...style }}
              onMouseEnter={onHover ? () => onHover(b.id) : undefined}
              onMouseLeave={onHover ? () => onHover(null) : undefined}
            >
              {b.leadingClip}
              {b.widthPct >= 8 && jobNames?.[b.jobId] ? <span>{jobNames[b.jobId]}</span> : null}
              {b.trailingClip}
            </div>
          )
        })}
      </div>
      {ticks.some((t) => t.label) && (
        <div className="ministrip-ticklabels" aria-hidden>
          {ticks.map((t, i) => {
            if (!t.label) return null
            const first = t.leftPct <= 0.01
            const last = t.leftPct >= 99.99
            return (
              <span
                key={i}
                className={`ministrip-tick-label${first ? ' is-first' : ''}${last ? ' is-last' : ''}`}
                style={first || last ? undefined : { left: `${t.leftPct}%` }}
              >
                {t.label}
              </span>
            )
          })}
        </div>
      )}
      {(() => {
        const items = legendItems(blocks, overlaps.length)
        return items.leading || items.trailing || items.overlap ? (
          <div className="ministrip-legend" aria-label="Timeline legend">
            {items.leading && <span><b>‹</b> starts before this day</span>}
            {items.trailing && <span><b>›</b> ends after this day</span>}
            {items.overlap && <span><b>×N</b> N entries overlap</span>}
          </div>
        ) : null
      })()}
    </div>
  )
}
