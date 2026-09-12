import { formatCents } from '~/lib/money'
import { TrioChip } from '~/components/trioChip'
import type { ReconciliationReport } from '~/server/services/reports'

/* Per-client table; footer = report.total. Operators see a table with no money column
   because their `recon` objects never carry `cents` (the column is omitted by the
   `'cents' in recon` test inside `TrioChip`'s $ segment). */
export function ReconTable({ report }: { report: ReconciliationReport }) {
  const showMoney = 'cents' in report.total
  return (
    <table className="recontable">
      <thead>
        <tr>
          <th>Client</th>
          <th>Figures</th>
          {showMoney ? <th className="money">$</th> : null}
        </tr>
      </thead>
      <tbody>
        {report.clients.map((c) => (
          <tr key={c.clientId}>
            <td className="nm">{c.name}</td>
            <td>
              <TrioChip recon={c} />
            </td>
            {showMoney && 'cents' in c ? <td className="money">{formatCents(c.cents)}</td> : null}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Period total</td>
          <td>
            <TrioChip recon={report.total} size="lg" />
          </td>
          {showMoney && 'cents' in report.total ? (
            <td className="money">{formatCents(report.total.cents)}</td>
          ) : null}
        </tr>
      </tfoot>
    </table>
  )
}
