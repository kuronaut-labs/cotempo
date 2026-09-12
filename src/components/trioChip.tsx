import { formatCents, formatDecimalHours } from '~/lib/money'
import type { RoleRecon } from '~/server/services/reports'

/* Reconciliation trio (billable / wall-clock / premium) plus an optional $-only segment
   when `cents` is present (#11, #14, #18). Operators receive recon without `cents`;
   check `'cents' in recon` so the segment hides without a `null` placeholder. */
export function TrioChip({ recon, size = 'sm' }: { recon: RoleRecon; size?: 'sm' | 'lg' }) {
  const showMoney = 'cents' in recon
  return (
    <div className={`trio${size === 'lg' ? ' lg' : ''}`} role="group" aria-label="Reconciliation trio">
      <div className="seg b">
        <span className="k">Billable</span>
        <span className="v">{formatDecimalHours(recon.billableMin)}</span>
      </div>
      <div className="seg h">
        <span className="k">Wall-clock</span>
        <span className="v">{formatDecimalHours(recon.wallClockMin)}</span>
      </div>
      <div className="seg p">
        <span className="k">Premium</span>
        <span className="v">+{formatDecimalHours(recon.premiumMin)}</span>
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
