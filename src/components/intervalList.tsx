import { Button } from '~/components/ui/button'
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
    return <div className="intervallist-empty">No entries logged for this day.</div>
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
          // Clip minutes to the queried day so the row matches the trio chips
          // (which are clipped at the service layer). The ‹/› glyph convention
          // (from miniStrip) flags the row as crossing the day boundary; the
          // full interval is still shown in Start/End. (#L4)
          const dayStartMs = Math.floor(startMs / 86_400_000) * 86_400_000
          const dayEndMs = dayStartMs + 86_400_000
          const clippedStart = Math.max(startMs, dayStartMs)
          const clippedEnd = Math.min(endMs, dayEndMs)
          const clippedMin = Math.max(0, Math.round((clippedEnd - clippedStart) / 60_000))
          const crossesDay = startMs < dayStartMs || endMs > dayEndMs
          const editable = canEdit(r.workerId)
          return (
            <tr key={r.id} className={crossesDay ? 'intervallist-crosses' : undefined}>
              <td>{r.jobName}</td>
              <td>{r.clientName}</td>
              <td className="mono">{localHHMM(startMs, tz)}{crossesDay && startMs < dayStartMs ? '‹' : ''}</td>
              <td className="mono">{localHHMM(endMs, tz)}{crossesDay && endMs > dayEndMs ? '›' : ''}</td>
              <td className="mono">
                {crossesDay ? <span title={`Full interval: ${formatHmm(min)}`}>{formatHmm(clippedMin)}</span> : formatHmm(min)}
              </td>
              <td>{r.note ?? ''}</td>
              <td className="intervallist-actions">
                {editable && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => onEdit(r.id)} aria-label="Edit">
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onDelete(r.id)} aria-label="Delete">
                      Delete
                    </Button>
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
