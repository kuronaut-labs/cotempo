import { formatCents, formatHmm } from '~/lib/money'
import type { ReconciliationReport } from '~/server/services/reports'

/* Bar widths as percent of the largest effort across clients. Pure: same report → same widths. */
export function barPercents(report: ReconciliationReport): Map<string, { wallPct: number; premiumPct: number }> {
  const out = new Map<string, { wallPct: number; premiumPct: number }>()
  const maxEffort = report.clients.reduce((m, c) => Math.max(m, c.effortMin), 0)
  if (maxEffort === 0) return out
  for (const c of report.clients) {
    const wallPct = (c.wallClockMin / maxEffort) * 100
    const premiumPct = (c.premiumMin / maxEffort) * 100
    out.set(c.clientId, { wallPct, premiumPct })
  }
  return out
}

/* Per-client horizontal bars: wall-clock solid, premium hatched extension. The total
   width of the bar (wall + premium) equals effort; the scale is the largest effort. */
export function ReconBars({ report }: { report: ReconciliationReport }) {
  const showMoney = 'cents' in report.total
  const pcts = barPercents(report)
  if (report.clients.length === 0) {
    return <div className="reconbars-empty">No time logged in this period.</div>
  }
  return (
    <div className="reconbars">
      <div className="legend">
        <span>
          <span className="sw" style={{ background: 'var(--color-primary)' }} />wall-clock
        </span>
        <span>
          <span
            className="sw"
            style={{ background: 'var(--premium-fill)' }}
          />
          premium
        </span>
      </div>
      {report.clients.map((c) => {
        const p = pcts.get(c.clientId)!
        return (
          <div className="recon" key={c.clientId}>
            <div className="nm">{c.name}</div>
            <div className="barwrap">
              <div className="bar honest" style={{ left: 0, width: `${p.wallPct}%` }}>
                <span className="lbl">{formatHmm(c.wallClockMin)}</span>
              </div>
              <div className="bar premium" style={{ left: `${p.wallPct}%`, width: `${p.premiumPct}%` }} />
            </div>
            <div className="nums">
              {showMoney && 'cents' in c ? <b>{formatCents(c.cents)}</b> : <b>{formatHmm(c.effortMin)}</b>}
              {c.premiumMin > 0 ? (
                <>
                  {' · '}
                  <span className="premium-tag">+{formatHmm(c.premiumMin)} premium</span>
                </>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
