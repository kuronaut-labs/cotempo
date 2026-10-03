import { formatCents, formatHmm } from '~/lib/money'
import { Link } from '@tanstack/react-router'
import { TrioChip } from '~/components/trioChip'
import type { ClientRecon, ReconciliationReport } from '~/server/services/reports'

/* Per-client table; footer = report.total. Operators see a table with no money column
   because their `recon` objects never carry `cents` (the column is omitted by the
   `'cents' in recon` test inside `TrioChip`'s $ segment). B2 adds the realization
   column; B4 adds Δ columns when a previous period is passed. */
export function ReconTable({ report, prev }: { report: ReconciliationReport; prev?: ReconciliationReport }) {
  const showMoney = 'cents' in report.total
  const showRealization = report.realization !== undefined
  const showDeltas = prev !== undefined
  const prevByClient = showDeltas ? new Map(prev!.clients.map((c) => [c.clientId, c])) : null
  const deltaText = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${formatHmm(Math.abs(n))}`
  return (
    <table className="recontable">
      <thead>
        <tr>
          <th className="nm">Client</th>
          <th>Figures</th>
          {showDeltas ? <th className="money">Effort Δ</th> : null}
          {showDeltas ? <th className="money">Premium Δ</th> : null}
          {showMoney && showDeltas ? <th className="money">$ Δ</th> : null}
          {showRealization ? <th className="money">Realization</th> : null}
        </tr>
        </thead>
      <tbody>
        {report.clients.map((c) => (
          <tr key={c.clientId}>
            <td className="nm"><Link to="/clients/$clientId" params={{ clientId: c.clientId }}>{c.name}</Link></td>
            <td>
              <TrioChip recon={c} />
            </td>
            {showDeltas
              ? (() => {
                  const p = prevByClient!.get(c.clientId)
                  const dEffort = c.effortMin - (p?.effortMin ?? 0)
                  const dPremium = c.premiumMin - (p?.premiumMin ?? 0)
                  return (
                    <>
                      <td className="money">{deltaText(dEffort)}</td>
                      <td className="money">{deltaText(dPremium)}</td>
                    </>
                  )
                })()
              : null}
            {showMoney && 'cents' in c && showDeltas
              ? (() => {
                  const p = prevByClient!.get(c.clientId) as ClientRecon | undefined
                  const pcs = p && 'cents' in p ? p.cents! : 0
                  const dc = c.cents - pcs
                  return <td className="money">{dc === 0 ? '—' : `${dc > 0 ? '+' : '-'}${formatCents(Math.abs(dc))}`}</td>
                })()
              : null}
            {showRealization ? (
              <td className="money">
                {report.realization![c.clientId]?.realizationPct == null
                  ? '—'
                  : `${report.realization![c.clientId]!.realizationPct}%`}
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Period total</td>
          <td>
            <TrioChip recon={report.total} size="lg" />
          </td>
          {showDeltas ? <td className="money" /> : null}
          {showDeltas ? <td className="money" /> : null}
          {showMoney && showDeltas ? <td className="money" /> : null}
          {showRealization ? <td className="money" /> : null}
        </tr>
      </tfoot>
    </table>
  )
}
