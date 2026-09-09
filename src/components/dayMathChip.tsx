import { formatHmm } from '~/lib/money'
import type { Trio } from '~/lib/dayMath'

// Always all three (wall-clock / effort / premium) — premium may be 0 (#11, #13).
export function DayMathChip({ trio }: { trio: Trio }) {
  return (
    <div className="daymath" role="group" aria-label="Day math trio">
      <div className="dm">
        <span className="k">wall</span>
        <b>{formatHmm(trio.wallClockMin)}</b>
      </div>
      <div className="dm">
        <span className="k">effort</span>
        <b>{formatHmm(trio.effortMin)}</b>
      </div>
      <div className={`dm${trio.premiumMin > 0 ? ' premium' : ''}`}>
        <span className="k">premium</span>
        <b>{formatHmm(trio.premiumMin)}</b>
      </div>
    </div>
  )
}
