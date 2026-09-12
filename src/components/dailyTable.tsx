import { formatDecimalHours } from '~/lib/money'
import type { DailyReport, RoleRecon } from '~/server/services/reports'

/* A single day×client cell: billable on top, wall-clock middle, premium with `+` prefix.
   Empty when there is no time at all (—); always three figures when there is, including
   zero values, so the signature trio is consistent. */
function DailyCell({ recon }: { recon: RoleRecon }) {
  if (recon.effortMin === 0 && recon.wallClockMin === 0) {
    return (
      <td className="dailycell empty" aria-label="no time">
        —
      </td>
    )
  }
  return (
    <td className="dailycell">
      <div className="b">{formatDecimalHours(recon.billableMin)}</div>
      <div className="h">{formatDecimalHours(recon.wallClockMin)}</div>
      <div className="p">+{formatDecimalHours(recon.premiumMin)}</div>
    </td>
  )
}

export function DailyTable({ report }: { report: DailyReport }) {
  return (
    <table className="dailytable">
      <thead>
        <tr>
          <th>Day</th>
          {report.clients.map((c) => (
            <th key={c.id} className="num">
              {c.name}
            </th>
          ))}
          <th className="num">Day total</th>
        </tr>
      </thead>
      <tbody>
        {report.days.map((day) => {
          const dayTotal = report.totals.byDay[day]
          // Defensive: dim rows whose recon is missing or has no time. The service
          // filters `days` to those with pieces, but zero-minute entries can slip in.
          const dim = !dayTotal || dayTotal.effortMin === 0
          return (
            <tr key={day} style={dim ? { opacity: 0.4 } : undefined}>
              <td className="daylabel">{day}</td>
              {report.clients.map((c) => {
                const cellRecon = report.cells[day]?.[c.id]
                return cellRecon ? <DailyCell key={c.id} recon={cellRecon} /> : <td key={c.id} className="dailycell empty">—</td>
              })}
              {dayTotal ? (
                <DailyCell recon={dayTotal} />
              ) : (
                <td className="dailycell empty">—</td>
              )}
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr className="total">
          <td className="daylabel">Period total</td>
          {report.clients.map((c) => {
            const tc = report.totals.byClient[c.id]
            return tc ? <DailyCell key={c.id} recon={tc} /> : <td key={c.id} className="dailycell empty">—</td>
          })}
          <DailyCell recon={report.totals.all} />
        </tr>
      </tfoot>
    </table>
  )
}
