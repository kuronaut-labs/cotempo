import { useEffect, useRef, useState } from 'react'
import { TZDate } from '@date-fns/tz'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { Check } from 'reicon-react'
import { localDateOf, localHHMM } from '~/lib/dayMath'
import { endFromDuration } from '~/lib/entryDefaults'
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
  compact = false,
  heading,
  autoFocusJob = false,
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
  /** One-row layout (LD7) for the top-of-Today create form; edit keeps the full layout. */
  compact?: boolean
  /** Rendered above the form when set (e.g. 'Add entry over X–Y'). */
  heading?: string
  /** Focus the job picker on mount (+ Overlap gesture lands here). */
  autoFocusJob?: boolean
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
      // Org-tz semantics (#19), not UTC bytes: a Perth morning session spans a UTC boundary.
      crossesMidnight: initial?.startedAt && initial?.endedAt
        ? localDateOf(Date.parse(initial.startedAt), tz) !== localDateOf(Date.parse(initial.endedAt), tz)
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

  const jobRef = useRef<HTMLSelectElement>(null)
  useEffect(() => {
    if (autoFocusJob) jobRef.current?.focus()
  }, [autoFocusJob])

  const workerOpts = workerGroups(selfWorkerId, superviseeWorkerIds, workers).flatMap((g) => g.options)
  const hideWorker = workerOpts.length <= 1

  const jobField = (
    <form.Field name="jobId">
      {(f) => (
        <label className="field">
          <span>Job</span>
          <select ref={jobRef} value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} onBlur={f.handleBlur}>
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
  )

  const startTimeField = (
    <form.Field name="startTime">
      {(f) => (
        <label className="field">
          <span>Start</span>
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
  )

  const endTimeField = (
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
            selector={(s) => durationText(s.values.startTime as string, s.values.endTime as string, s.values.crossesMidnight as boolean)}
          >
            {(duration) => (duration ? <span className="entryform-duration">= {duration}</span> : null)}
          </form.Subscribe>
          <FieldError errors={f.state.meta.errors} />
        </label>
      )}
    </form.Field>
  )

  const durationField = (
    <form.Subscribe selector={(s) => durationText(s.values.startTime as string, s.values.endTime as string, s.values.crossesMidnight as boolean)}>
      {(duration) => (
        <label className="field">
          <span>Duration</span>
          <input
            type="text"
            inputMode="numeric"
            value={duration}
            onChange={(e) => {
              const min = parseDuration(e.target.value)
              if (min === null) return
              const v = form.state.values
              const { end, crossesMidnight } = endFromDuration(v.startTime as string, min)
              form.setFieldValue('endTime', end)
              form.setFieldValue('crossesMidnight', crossesMidnight)
            }}
          />
        </label>
      )}
    </form.Subscribe>
  )

  const noteField = (
    <form.Field name="note">
      {(f) => (
        <label className="field">
          <span>Note</span>
          <textarea value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} rows={2} />
        </label>
      )}
    </form.Field>
  )

  const workerField = hideWorker ? null : (
    <form.Field name="workerId">
      {(f) => (
        <label className="field">
          <span>Worker</span>
          <select value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} onBlur={f.handleBlur}>
            {workerOpts.length ? (
              workerGroups(selfWorkerId, superviseeWorkerIds, workers).map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))
            ) : (
              <option value={selfWorkerId}>{workers.find((w) => w.workerId === selfWorkerId)?.name ?? 'Me'}</option>
            )}
          </select>
        </label>
      )}
    </form.Field>
  )

  const actions = (
    <div className="entryform-actions">
      <Button type="submit" variant="primary">
        <Check size={14} /> {isEdit ? 'Save' : 'Add'}
      </Button>
      {isEdit && onCancel && (
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  )

  const crossesCheckbox = (
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
  )

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className={compact ? 'entryform compact' : 'entryform'}
    >
      {heading ? <h2 className="today-section-title">{heading}</h2> : null}
      {compact ? (
        <>
          <div className="entryform-row entryform-main">
            {jobField}
            {startTimeField}
            {durationField}
            <div className="entryform-actions">{submitButton(isEdit)}</div>
          </div>
          <details className="entryform-more">
            <summary>More</summary>
            {workerField}
            {endTimeField}
            {noteField}
            {form.state.errorMap.onServer && (
              <p role="alert" className="form-error">
                {String(form.state.errorMap.onServer)}
              </p>
            )}
          </details>
        </>
      ) : (
        <>
          {workerField}
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
          {jobField}
          <div className="entryform-row">
            {startTimeField}
            {endTimeField}
          </div>
          {crossesCheckbox}
          {noteField}
          {form.state.errorMap.onServer && (
            <p role="alert" className="form-error">
              {String(form.state.errorMap.onServer)}
            </p>
          )}
          {actions}
        </>
      )}
    </form>
  )
}

function submitButton(isEdit: boolean) {
  return (
    <Button type="submit" variant="primary">
      <Check size={14} /> {isEdit ? 'Save' : 'Add'}
    </Button>
  )
}

function durationText(startHHMM: string, endHHMM: string, crossesMidnight: boolean): string {
  if (!startHHMM || !endHHMM) return ''
  const [sh, sm] = startHHMM.split(':').map(Number) as [number, number]
  const [eh, em] = endHHMM.split(':').map(Number) as [number, number]
  let totalMin = eh * 60 + em - (sh * 60 + sm)
  if (totalMin < 0 && crossesMidnight) totalMin += 24 * 60
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  return `${hh}:${String(mm).padStart(2, '0')}`
}

/** Accepts `H:MM` / `HH:MM` or `H.HH` hours; rejects garbage. */
export function parseDuration(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  if (t.includes(':')) {
    const m = /^(\d{1,2}):(\d{1,2})$/.exec(t)
    if (!m) return null
    return Number(m[1]) * 60 + Number(m[2])
  }
  if (t.includes('.')) {
    const h = Number(t)
    if (Number.isNaN(h) || h < 0 || h > 24) return null
    return Math.round(h * 60)
  }
  const min = Number(t)
  if (Number.isNaN(min) || min < 0 || min > 1440) return null
  return min
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
