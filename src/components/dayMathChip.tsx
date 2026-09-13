import { formatHmm } from '~/lib/money'
import type { Trio } from '~/lib/dayMath'

// Always all three (wall-clock / effort / premium) — premium may be 0 (#11, #13).
export function DayMathChip({ trio }: { trio: Trio }) {
  return (
    <div className="daymath" role="group" aria-label="Time summary">
      <div className="dm" title={`On the clock — ${formatHmm(trio.wallClockMin)}. Time covered; overlaps counted once.`}>
        <span className="k">On the clock</span>
        <b>{formatHmm(trio.wallClockMin)}</b>
      </div>
      <div className="dm" title={`Total of entries — ${formatHmm(trio.effortMin)}. What you'd get by adding every entry.`}>
        <span className="k">Total of entries</span>
        <b>{formatHmm(trio.effortMin)}</b>
      </div>
      <div className={`dm${trio.premiumMin > 0 ? ' premium' : ''}`} title={`Overlap — ${formatHmm(trio.premiumMin)}. Extra minutes from working two jobs at once.`}>
        <span className="k">Overlap</span>
        <b>{formatHmm(trio.premiumMin)}</b>
      </div>
    </div>
  )
}
