import { localHHMM } from '~/lib/dayMath'
import { formatHmm } from '~/lib/money'
import type { DayIntervalRow } from '~/server/services/intervals'

// Edit/Delete are UX-only; the server re-checks (#10).
export function IntervalList({
  rows,
  tz,
  canEdit,
  onEdit,
  onDelete,
}: {
  rows: DayIntervalRow[]
  tz: string
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
          const startMs = r.startedAt.getTime()
          const endMs = r.endedAt.getTime()
          const min = Math.max(0, Math.round((endMs - startMs) / 60_000))
          const editable = canEdit(r.workerId)
          return (
            <tr key={r.id}>
              <td>{r.jobName}</td>
              <td>{r.clientName}</td>
              <td className="mono">{localHHMM(startMs, tz)}</td>
              <td className="mono">{localHHMM(endMs, tz)}</td>
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
