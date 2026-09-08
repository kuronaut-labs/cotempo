import { useState } from 'react'
import { TZDate } from '@date-fns/tz'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { CreateIntervalInput, UpdateIntervalInput } from '~/lib/schemas/intervals'
import { applyServerError } from '~/components/forms/applyServerError'
import type { ClientNode } from '~/server/services/structure'
import type { WorkerView } from '~/server/services/workers'

type WorkerGroup = { label: string; options: { value: string; label: string }[] }

type CreateInput = z.infer<typeof CreateIntervalInput>
type UpdateInput = z.infer<typeof UpdateIntervalInput>
type FormInput = CreateInput | UpdateInput

export type Initial = {
  id?: string
  workerId?: string
  jobId?: string
  startedAt?: string
  endedAt?: string
  note?: string | null
}

// `initial.id` toggles create ↔ edit. Time-of-day inputs combine with `date` +
// the org's IANA zone into an ISO UTC string via `TZDate` (#23) — the one
// place the browser touches the zone; the server still uses org-tz boundaries.
export function EntryForm({
  date,
  tz,
  selfWorkerId,
  superviseeWorkerIds,
  workers,
  structure,
  initial,
  onSubmit,
}: {
  date: string
  tz: string
  /** Used to split workers into "Self" / "Supervisees" / "Agents" groups. */
  selfWorkerId: string
  superviseeWorkerIds: string[]
  workers: WorkerView[]
  structure: ClientNode[]
  initial?: Initial
  onSubmit: (input: FormInput) => Promise<void>
}) {
  const isEdit = Boolean(initial?.id)

  // Default start = 09:00, end = 10:00 of the requested day, in the org tz.
  const defaultTimeStart = '09:00'
  const defaultTimeEnd = '10:00'

  const form = useForm({
    defaultValues: {
      id: initial?.id,
      workerId: initial?.workerId ?? selfWorkerId,
      jobId: initial?.jobId ?? '',
      startTime: initial?.startedAt ? toLocalHHMM(initial.startedAt, tz) : defaultTimeStart,
      endTime: initial?.endedAt ? toLocalHHMM(initial.endedAt, tz) : defaultTimeEnd,
      note: initial?.note ?? '',
    } as {
      id?: string
      workerId: string
      jobId: string
      startTime: string
      endTime: string
      note: string
    },
    validators: { onSubmit: () => z.unknown() }, // server schema re-validates
    onSubmit: async ({ value }) => {
      const startedAt = combine(date, value.startTime, tz)
      const endedAt = combine(date, value.endTime, tz)
      const note = value.note.trim()
      const payload: FormInput = isEdit
        ? {
            id: value.id!,
            workerId: value.workerId,
            jobId: value.jobId,
            startedAt,
            endedAt,
            ...(note ? { note } : {}),
          }
        : {
            workerId: value.workerId,
            jobId: value.jobId,
            startedAt,
            endedAt,
            ...(note ? { note } : {}),
          }
      try {
        await onSubmit(payload)
      } catch (e) {
        applyServerError(form as never, e)
      }
    },
  })

  const [selectedClient, setSelectedClient] = useState<string>(
    initial?.jobId ? findClientForJob(structure, initial.jobId) ?? '' : structure[0]?.id ?? '',
  )

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="entryform"
    >
      <label className="field">
        <span>Date</span>
        <input type="date" value={date} disabled />
      </label>

      <form.Field name="workerId">
        {(f) => (
          <label className="field">
            <span>Worker</span>
            <select
              value={f.state.value}
              onChange={(e) => f.handleChange(e.target.value)}
              onBlur={f.handleBlur}
            >
              {workerGroups(selfWorkerId, superviseeWorkerIds, workers).map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
      </form.Field>

      <label className="field">
        <span>Client</span>
        <select
          value={selectedClient}
          onChange={(e) => {
            setSelectedClient(e.target.value)
            form.setFieldValue('jobId', '')
          }}
        >
          {structure
            .filter((c) => !c.archivedAt)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>

      <form.Field name="jobId">
        {(f) => (
          <label className="field">
            <span>Job</span>
            <select
              value={f.state.value}
              onChange={(e) => f.handleChange(e.target.value)}
              onBlur={f.handleBlur}
            >
              <option value="">— select —</option>
              {(structure.find((c) => c.id === selectedClient)?.projects ?? [])
                .filter((p) => !p.archivedAt)
                .flatMap((p) =>
                  p.jobs
                    .filter((j) => !j.archivedAt)
                    .map((j) => (
                      <option key={j.id} value={j.id}>
                        {p.name} / {j.name}
                      </option>
                    )),
                )}
            </select>
            {f.state.meta.errors[0] && (
              <span className="field-error">{String(f.state.meta.errors[0])}</span>
            )}
          </label>
        )}
      </form.Field>

      <div className="entryform-row">
        <form.Field name="startTime">
          {(f) => (
            <label className="field">
              <span>Start ({tz})</span>
              <input
                type="time"
                step="60"
                value={f.state.value}
                onChange={(e) => f.handleChange(e.target.value)}
                onBlur={f.handleBlur}
              />
            </label>
          )}
        </form.Field>
        <form.Field name="endTime">
          {(f) => (
            <label className="field">
              <span>End ({tz})</span>
              <input
                type="time"
                step="60"
                value={f.state.value}
                onChange={(e) => f.handleChange(e.target.value)}
                onBlur={f.handleBlur}
              />
            </label>
          )}
        </form.Field>
      </div>

      <form.Field name="note">
        {(f) => (
          <label className="field">
            <span>Note</span>
            <textarea value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} rows={2} />
          </label>
        )}
      </form.Field>

      {form.state.errorMap.onServer && (
        <p role="alert" className="form-error">
          {String(form.state.errorMap.onServer)}
        </p>
      )}

      <button type="submit" className="btn-primary">
        {isEdit ? 'Save' : 'Add'}
      </button>
    </form>
  )
}

function workerGroups(selfId: string, superviseeIds: string[], workers: WorkerView[]): WorkerGroup[] {
  const humans = workers.filter((w) => w.kind === 'human')
  const agents = workers.filter((w) => w.kind === 'agent')
  const tag = (h: { workerId: string; name: string }) => {
    if (h.workerId === selfId) return `${h.name} (self)`
    if (superviseeIds.includes(h.workerId)) return `${h.name} (supervisee)`
    return h.name
  }
  return [
    {
      label: 'Operators',
      options: humans.map((h) => ({ value: h.workerId, label: tag(h) })),
    },
    {
      label: 'Agents',
      options: agents.map((a) => ({ value: a.workerId, label: a.name })),
    },
  ]
}

function findClientForJob(structure: ClientNode[], jobId: string): string | null {
  for (const c of structure) for (const p of c.projects) for (const j of p.jobs) if (j.id === jobId) return c.id
  return null
}

/** Combine the form's `date` and `HH:MM` time in the org tz into a UTC ISO string. */
function combine(date: string, hhmm: string, tz: string): string {
  // Construct the wall-clock instant in the org zone, then convert to UTC.
  const wall = `${date}T${hhmm}:00`
  return new TZDate(wall, tz).toISOString()
}

function toLocalHHMM(iso: string, tz: string): string {
  const t = new TZDate(iso, tz)
  return `${pad(t.getHours())}:${pad(t.getMinutes())}`
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}
