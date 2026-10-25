import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Layers, Pen, Trash2 } from 'reicon-react'
import { Button } from '~/components/ui/button'
import { localHHMM, type Range } from '~/lib/dayMath'
import { formatHmm } from '~/lib/money'
import type { DayIntervalRow } from '~/server/services/intervals'

/** Minutes of [startMs, endMs) inside the local `day`, so a row matches the service's clipped trio (#23). */
export function clipToDay(startMs: number, endMs: number, day: Range): { minutes: number; crossesDay: boolean } {
  const minutes = Math.max(0, Math.round((Math.min(endMs, day.endMs) - Math.max(startMs, day.startMs)) / 60_000))
  return { minutes, crossesDay: startMs < day.startMs || endMs > day.endMs }
}

// Edit/Delete are UX-only; the server re-checks (#10).
export function IntervalList({
  rows,
  day,
  tz,
  canEdit,
  onEdit,
  onDelete,
  jobColorIndex,
  hoverId,
  onHover,
  onOverlap,
}: {
  rows: DayIntervalRow[]
  day: Range
  tz: string
  canEdit: (workerId: string) => boolean
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  jobColorIndex?: Record<string, number>
  hoverId?: string | null
  onHover?: (id: string | null) => void
  onOverlap?: (id: string) => void
}) {
  // Two-step delete inline: the second click on the armed button deletes. No
  // native window.confirm, and the action stays where the finger is (#P2-2).
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  if (rows.length === 0) {
    return <div className="intervallist-empty">No entries logged for this day.</div>
  }
  return (
    <div className="intervallist-wrap">
      <table className="intervallist">
        <thead>
          <tr>
            <th>Job</th>
            <th className="col-client">Client</th>
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
            // The ‹/› glyph convention (from miniStrip) flags a row crossing the day
            // boundary; the full interval is still shown in Start/End. (#L4)
            const { minutes: clippedMin, crossesDay } = clipToDay(startMs, endMs, day)
            const editable = canEdit(r.workerId)
            const n = jobColorIndex?.[r.jobId]
            const swatch = n ? ` job-c${Math.min(5, Math.max(1, n))}` : ''
            return (
              <tr
                key={r.id}
                className={`${crossesDay ? 'intervallist-crosses' : ''}${hoverId === r.id ? ' is-hover' : ''}`.trim() || undefined}
                onMouseEnter={onHover ? () => onHover(r.id) : undefined}
                onMouseLeave={onHover ? () => onHover(null) : undefined}
              >
                <td>
                  {n ? <span aria-hidden className={`swatch${swatch}`} /> : null}
                  <Link to="/projects/$projectId" params={{ projectId: r.projectId }}>{r.jobName}</Link>
                  <span className="client-inline">{r.clientName}</span>
                </td>
                <td className="col-client">{r.clientName}</td>
                <td className="mono">{localHHMM(startMs, tz)}{startMs < day.startMs ? '‹' : ''}</td>
                <td className="mono">{localHHMM(endMs, tz)}{endMs > day.endMs ? '›' : ''}</td>
                  <td className="mono">
                    {crossesDay ? <span data-tip={`Full entry (spans midnight): ${formatHmm(min)}`}>{formatHmm(clippedMin)}</span> : formatHmm(min)}
                  </td>
                <td>{r.note ?? ''}</td>
                <td className="intervallist-actions">
                  {editable && (
                    <>
                      {onOverlap && (
                        <Button variant="ghost" size="sm" onClick={() => onOverlap(r.id)} aria-label="Add overlap">
                          <Layers size={13} /> + Overlap
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => onEdit(r.id)} aria-label="Edit">
                        <Pen size={13} /> Edit
                      </Button>
                      {confirmDeleteId === r.id ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setConfirmDeleteId(null)
                            onDelete(r.id)
                          }}
                          onBlur={() => setConfirmDeleteId(null)}
                          aria-label="Confirm delete"
                          data-tip="Click again to delete"
                        >
                          <Trash2 size={13} /> Delete?
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteId(r.id)}
                          aria-label="Delete"
                        >
                          <Trash2 size={13} /> Delete
                        </Button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
