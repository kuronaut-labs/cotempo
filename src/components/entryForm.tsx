import { useState } from 'react'
import { TZDate } from '@date-fns/tz'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { localHHMM } from '~/lib/dayMath'
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

const serverFieldMap: Record<string, string> = { startedAt: 'startTime', endedAt: 'endTime' }

/*
 * `initial.id` toggles create ↔ edit; callers `key` the element on it because form-core ignores
 * new defaultValues once touched. The one place the browser builds an instant, in the org tz (#23).
 */
export function EntryForm({
  date,
  tz,
  selfWorkerId,
  superviseeWorkerIds,
  workers,
  structure,
  initial,
  onSubmit,
  onCancel,
}: {
  date: string
  tz: string
  selfWorkerId: string
  superviseeWorkerIds: string[]
  workers: WorkerView[]
  structure: ClientNode[]
  initial?: Initial
  onSubmit: (input: FormInput) => Promise<void>
  /** Shown in edit mode only. */
  onCancel?: () => void
}) {
  const isEdit = Boolean(initial?.id)

  const form = useForm({
    defaultValues: {
      id: initial?.id,
      workerId: initial?.workerId ?? selfWorkerId,
      jobId: initial?.jobId ?? '',
      startTime: initial?.startedAt ? localHHMM(Date.parse(initial.startedAt), tz) : '09:00',
      endTime: initial?.endedAt ? localHHMM(Date.parse(initial.endedAt), tz) : '10:00',
      note: initial?.note ?? '',
    } as {
      id?: string
      workerId: string
      jobId: string
      startTime: string
      endTime: string
      note: string
    },
    validators: {
      onSubmit: ({ value }) => {
        const fields: Record<string, string> = {}
        if (!value.jobId) fields.jobId = 'Choose a job.'
        if (!value.startTime) fields.startTime = 'Enter a start time.'
        if (!value.endTime) fields.endTime = 'Enter an end time.'
        return Object.keys(fields).length ? { fields } : undefined
      },
    },
    onSubmit: async ({ value }) => {
      const startedAt = combine(date, value.startTime, tz)
      const endedAt = combine(date, value.endTime, tz)
      const note = value.note.trim()
      const base = { workerId: value.workerId, jobId: value.jobId, startedAt, endedAt, ...(note ? { note } : {}) }
      const payload: FormInput = isEdit ? { id: value.id!, ...base } : base
      try {
        await onSubmit(payload)
      } catch (e) {
        const err = e as { field?: string } | null
        const field = err?.field ? serverFieldMap[err.field] ?? err.field : undefined
        applyServerError(form, err && typeof err === 'object' ? { ...err, field } : err)
      }
    },
  })

  const [selectedClient, setSelectedClient] = useState<string>(
    initial?.jobId ? (findClientForJob(structure, initial.jobId) ?? '') : (structure[0]?.id ?? ''),
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
            <select value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} onBlur={f.handleBlur}>
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
            <select value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} onBlur={f.handleBlur}>
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
            <FieldError errors={f.state.meta.errors} />
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
              <FieldError errors={f.state.meta.errors} />
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
              <FieldError errors={f.state.meta.errors} />
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

      <div className="entryform-actions">
        <button type="submit" className="btn-primary">
          {isEdit ? 'Save' : 'Add'}
        </button>
        {isEdit && onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

function FieldError({ errors }: { errors: unknown[] }) {
  const first = errors.find(Boolean)
  return first ? <span className="field-error">{String(first)}</span> : null
}

// Self/supervisee as tags, not groups, so the select stays short.
function workerGroups(selfId: string, superviseeIds: string[], workers: WorkerView[]): WorkerGroup[] {
  const humans = workers.filter((w) => w.kind === 'human')
  const agents = workers.filter((w) => w.kind === 'agent')
  const tag = (h: { workerId: string; name: string }) => {
    if (h.workerId === selfId) return `${h.name} (self)`
    if (superviseeIds.includes(h.workerId)) return `${h.name} (supervisee)`
    return h.name
  }
  return [
    { label: 'Operators', options: humans.map((h) => ({ value: h.workerId, label: tag(h) })) },
    { label: 'Agents', options: agents.map((a) => ({ value: a.workerId, label: a.name })) },
  ]
}

function findClientForJob(structure: ClientNode[], jobId: string): string | null {
  for (const c of structure) for (const p of c.projects) for (const j of p.jobs) if (j.id === jobId) return c.id
  return null
}

function combine(date: string, hhmm: string, tz: string): string {
  // TZDate.toISOString() emits local time with a numeric offset; the wire schema (#19) wants UTC Z.
  return new Date(new TZDate(`${date}T${hhmm}:00`, tz).getTime()).toISOString()
}
