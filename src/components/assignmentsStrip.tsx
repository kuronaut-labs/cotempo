import { StatusChip } from '~/components/ui/chip'
import { formatHmm } from '~/lib/money'
import type { AllocationRow } from '~/server/services/allocations'

type WorkerLite = { workerId: string; kind: 'human' | 'agent'; name: string }

const PACE_LABEL: Record<string, string> = {
  ahead: 'Ahead',
  on_track: 'On track',
  behind: 'Behind',
  over: 'Over',
  n_a: '—',
}

const PACE_KIND: Record<string, 'success' | 'error' | 'muted'> = {
  ahead: 'success',
  on_track: 'success',
  behind: 'error',
  over: 'error',
  n_a: 'muted',
}

/** One line per assignment for the visible workers; hidden when nobody has any. */
export function AssignmentsStrip({
  rows,
  workers,
}: {
  rows: AllocationRow[]
  workers: WorkerLite[]
}) {
  const visible = new Set(workers.map((w) => w.workerId))
  const mine = rows.filter((r) => visible.has(r.workerId))
  if (mine.length === 0) return null
  return (
    <section className="panel assignmentsstrip" aria-label="Assignments">
      <h2 className="today-section-title">Assignments</h2>
      <ul>
        {mine.map((r) => (
          <li key={r.assignmentId}>
            <span>{r.workerName}</span>
            <span className="dot">·</span>
            <span>{r.targetName}</span>
            {r.dueOn ? (
              <>
                <span className="dot">·</span>
                <span className="mono">Due {r.dueOn}</span>
              </>
            ) : null}
            <span className="dot">·</span>
            {r.remainingMinutes == null ? (
              <span className="mono">{formatHmm(r.allocatedMinutes ?? 0)} allocated</span>
            ) : (
              <span className="mono">{formatHmm(r.remainingMinutes)} left</span>
            )}
            <StatusChip kind={PACE_KIND[r.pace] ?? 'muted'}>{PACE_LABEL[r.pace] ?? '—'}</StatusChip>
          </li>
        ))}
      </ul>
    </section>
  )
}
