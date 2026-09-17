import { useState } from 'react'
import { TZDate } from '@date-fns/tz'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { localHHMM } from '~/lib/dayMath'
import { CreateIntervalInput, UpdateIntervalInput } from '~/lib/schemas/intervals'
import { applyServerError } from '~/components/forms/applyServerError'
import { Button } from '~/components/ui/button'
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
  recentJobs,
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
  /** Jobs this worker has used recently, ordered most-recent first (P3.15). */
  recentJobs?: { jobId: string; jobName: string; projectName: string; clientName: string; clientId: string }[]
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
      crossesMidnight: initial?.startedAt && initial?.endedAt
        ? new Date(initial.endedAt).getUTCDate() !== new Date(initial.startedAt).getUTCDate()
        : false,
      note: initial?.note ?? '',
    } as {
      id?: string
      workerId: string
      jobId: string
      startTime: string
      endTime: string
      crossesMidnight: boolean
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
      // If "crosses midnight" is checked, the end time belongs to the next day
      // in the org tz; otherwise both are on `date`. (#L1)
      const endDate = value.crossesMidnight ? addDaysIso(date, 1) : date
      const startedAt = combine(date, value.startTime, tz)
      const endedAt = combine(endDate, value.endTime, tz)
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
              {recentJobs && recentJobs.length > 0 && (
                <optgroup label="Recent">
                  {recentJobs.map((j) => (
                    <option key={j.jobId} value={j.jobId}>
                      {j.clientName} / {j.projectName} / {j.jobName}
                    </option>
                  ))}
                </optgroup>
              )}
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
              <form.Subscribe
                selector={(s) => {
                  const start = s.values.startTime as string | undefined
                  const end = f.state.value
                  if (!start || !end) return ''
                  const [sh, sm] = start.split(':').map(Number) as [number, number]
                  const [eh, em] = end.split(':').map(Number) as [number, number]
                  let totalMin = eh * 60 + em - (sh * 60 + sm)
                  if (totalMin < 0) totalMin += 24 * 60
                  const hh = Math.floor(totalMin / 60)
                  const mm = totalMin % 60
                  return `${hh}:${String(mm).padStart(2, '0')}`
                }}
              >
                {(duration) =>
                  duration ? <span className="entryform-duration">= {duration}</span> : null
                }
              </form.Subscribe>
              <FieldError errors={f.state.meta.errors} />
            </label>
          )}
        </form.Field>
      </div>
      <form.Field name="crossesMidnight">
        {(f) => (
          <label className="checkline">
            <input
              type="checkbox"
              checked={f.state.value}
              onChange={(e) => f.handleChange(e.target.checked)}
              onBlur={f.handleBlur}
            />
            Crosses midnight (end time is on the next day)
          </label>
        )}
      </form.Field>

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
        <Button type="submit" variant="primary">
          {isEdit ? 'Save' : 'Add'}
        </Button>
        {isEdit && onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
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
    { label: 'People', options: humans.map((h) => ({ value: h.workerId, label: tag(h) })) },
    { label: 'AI assistants', options: agents.map((a) => ({ value: a.workerId, label: a.name })) },
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

function addDaysIso(iso: string, days: number): string {
  // Used only for the crosses-midnight affordance — shift YYYY-MM-DD by `days`
  // in calendar terms (no tz needed; we're just moving to the next/prev day).
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}
