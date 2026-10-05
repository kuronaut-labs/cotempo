import { useState } from 'react'
import { formatHmm } from '~/lib/money'
import { archiveAssignmentFn, createAssignmentFn, updateAssignmentFn, type AssignmentView } from '~/server/fns/assignments'

type RunFn = (op: () => Promise<unknown>) => Promise<boolean>

/* ---------- AssignPills (Stage 3 Task 2.2 / 3.1) ---------- */

export function AssignPills({
  targetKind,
  targetId,
  assignments,
  workers,
  run,
}: {
  targetKind: 'project' | 'job'
  targetId: string
  assignments: AssignmentView[]
  workers: { workerId: string; name: string; kind: 'human' | 'agent' }[]
  run: RunFn
}) {
  const [hoursError, setHoursError] = useState<string | null>(null)
  const here = assignments.filter((a) => a.targetKind === targetKind && a.targetId === targetId)
  const assignedIds = new Set(here.map((a) => a.workerId))
  const options = workers.filter((w) => !assignedIds.has(w.workerId))

  const saveHours = (a: AssignmentView, raw: string) => {
    const t = raw.trim()
    if (t !== '' && !/^\d+(\.\d{1,2})?$/.test(t)) {
      setHoursError('Enter hours like 8 or 7.5, or leave blank')
      return
    }
    setHoursError(null)
    void run(() =>
      updateAssignmentFn({ data: { id: a.id, allocatedMinutes: t === '' ? null : Math.round(Number(t) * 60) } }),
    )
  }

  return (
    <div className="assignpills">
      {here.length === 0 && <span className="lane-empty-note">Nobody assigned</span>}
      {here.map((a) => (
        <span key={a.id} className="assignpill">
          <span data-tip={workers.find((w) => w.workerId === a.workerId)?.kind === 'agent' ? 'Agent' : undefined}>
            {a.workerName}
          </span>
          {a.allocatedMinutes != null ? <span className="mono">{formatHmm(a.allocatedMinutes)}</span> : null}
          <input
            type="text"
            inputMode="decimal"
            placeholder="h"
            aria-label={`Hours for ${a.workerName}`}
            className="assignpill-hours"
            value={a.allocatedMinutes != null ? String(a.allocatedMinutes / 60) : ''}
            onBlur={(e) => saveHours(a, e.target.value)}
          />
          <button
            type="button"
            className="assignpill-x"
            data-tip="Unassign"
            aria-label={`Unassign ${a.workerName}`}
            onClick={() => void run(() => archiveAssignmentFn({ data: { id: a.id } }))}
          >
            ✕
          </button>
        </span>
      ))}
      {hoursError && <span className="field-error">{hoursError}</span>}
      {options.length > 0 && (
        <select
          aria-label="Assign a worker"
          value=""
          onChange={(e) => {
            const wid = e.target.value
            if (!wid || !e.target.selectedOptions[0]) return
            const label = e.target.selectedOptions[0].dataset.value ?? wid
            void label
            void run(() => createAssignmentFn({ data: { workerId: wid, targetKind, targetId } }))
          }}
        >
          <option value="">Assign…</option>
          {options.map((w) => (
            <option key={w.workerId} value={w.workerId} data-value={w.workerId}>
              {w.name}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}


