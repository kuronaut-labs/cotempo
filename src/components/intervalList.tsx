import { formatHmm } from '~/lib/money'
import type { DayIntervalRow } from '~/server/services/intervals'

// Read-only row list for the today view. Edit/Delete are UX-only — the server re-checks (#10).
// Renders UTC times as `HH:MM`; the day boundary comes from `localDayBoundariesUtcMs` in the route (#23).
export function IntervalList({
  rows,
  canEdit,
  onEdit,
  onDelete,
}: {
  rows: DayIntervalRow[]
  canEdit: (workerId: string) => boolean
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}) {
  if (rows.length === 0) {
    return <div className="intervallist-empty">No intervals logged for this day.</div>
  }
  return (
    <table className="intervallist">
      <thead>
        <tr>
          <th>Job</th>
          <th>Client</th>
          <th>Start</th>
          <th>End</th>
          <th>Min</th>
          <th>Note</th>
          <th aria-label="actions" />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const start = new Date(r.startedAt)
          const end = new Date(r.endedAt)
          const min = Math.max(0, (end.getTime() - start.getTime()) / 60_000)
          const editable = canEdit(r.workerId)
          return (
            <tr key={r.id}>
              <td>{r.jobName}</td>
              <td>{r.clientName}</td>
              <td className="mono">{hhmm(start)}</td>
              <td className="mono">{hhmm(end)}</td>
              <td className="mono">{formatHmm(min)}</td>
              <td>{r.note ?? ''}</td>
              <td className="intervallist-actions">
                {editable && (
                  <>
                    <button type="button" onClick={() => onEdit(r.id)} aria-label="Edit">
                      Edit
                    </button>
                    <button type="button" onClick={() => onDelete(r.id)} aria-label="Delete">
                      Delete
                    </button>
                  </>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const hhmm = (d: Date) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
const pad = (n: number) => String(n).padStart(2, '0')
