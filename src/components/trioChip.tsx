import { formatCents, formatHmm } from '~/lib/money'
import type { RoleRecon } from '~/server/services/reports'

/* Reconciliation trio (billable / wall-clock / premium) plus an optional $-only segment
   when `cents` is present (#11, #14, #18). Operators receive recon without `cents`;
   check `'cents' in recon` so the segment hides without a `null` placeholder. */
export function TrioChip({ recon, size = 'sm' }: { recon: RoleRecon; size?: 'sm' | 'lg' }) {
  const showMoney = 'cents' in recon
  return (
    <div className={`trio${size === 'lg' ? ' lg' : ''}`} role="group" aria-label="Time summary">
      <div className="seg b" data-tip={`Billable — ${formatHmm(recon.billableMin)}. Time that can be billed to a client.`}>
        <span className="k">Billable</span>
        <span className="v">{formatHmm(recon.billableMin)}</span>
      </div>
      <div className="seg h" data-tip={`On the clock — ${formatHmm(recon.wallClockMin)}. Time covered; overlaps counted once.`}>
        <span className="k">On the clock</span>
        <span className="v">{formatHmm(recon.wallClockMin)}</span>
      </div>
      <div className="seg p" data-tip={`Overlap — ${formatHmm(recon.premiumMin)}. Extra minutes from working two jobs at once.`}>
        <span className="k">Overlap</span>
        <span className="v">+{formatHmm(recon.premiumMin)}</span>
      </div>
      {showMoney ? (
        <div className="seg dollar">
          <span className="k">$ billable</span>
          <span className="v">{formatCents(recon.cents)}</span>
        </div>
      ) : null}
    </div>
  )
}
