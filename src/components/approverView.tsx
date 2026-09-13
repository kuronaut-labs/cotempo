import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { applyServerError } from '~/components/forms/applyServerError'
import { formatWeekLabel, localDateTimeOf, localHHMM } from '~/lib/dayMath'
import { RedFlagList } from '~/components/redFlagList'
import { TrioChip } from '~/components/trioChip'
import { STATUS_LABEL } from '~/components/weekStatus'
import type { Role } from '~/server/context'
import { approveWeekFn, rejectWeekFn, unlockWeekFn } from '~/server/fns/approvals'
import type { WeekForApproval } from '~/server/services/approvals'

const EVENT_LABEL: Record<WeekForApproval['events'][number]['kind'], string> = {
  submit: 'Submitted',
  approve: 'Approved',
  reject: 'Sent back',
  unlock: 'Unlocked',
  edited_after_submit: 'Edited after submitting',
}

const CommentSchema = z.object({ comment: z.string().max(500).optional() })
const ReasonSchema = z.object({ reason: z.string().min(1, 'Reason required').max(500) })

export function ApproverView({
  week,
  role,
  tz,
  onAction,
}: {
  week: WeekForApproval
  role: Role[]
  tz: string
  onAction: () => Promise<void>
}) {
  const [hover, setHover] = useState<string | undefined>(undefined)
  const isAdmin = role.includes('admin')
  const isBilling = role.includes('billing') || isAdmin
  const target = { workerId: week.workerId, weekStart: week.weekStart }

  return (
    <div className="approverview">
      <header className="approverview-head">
        <div>
          <h2>{week.workerName}</h2>
          <span className="approverview-week">{formatWeekLabel(week.weekStart)}</span>
          <span className={`weekstatus-badge ${week.status}`} style={{ marginLeft: 12 }}>
            {STATUS_LABEL[week.status]}
          </span>
        </div>
        <TrioChip recon={week.recon} size="lg" />
      </header>

      <section className="card">
        <h2>Entries ({week.intervals.length})</h2>
        {week.intervals.length === 0 ? (
          <div className="lanebody-empty">No entries this week.</div>
        ) : (
          <table className="intervalaudit">
            <thead>
              <tr>
                <th>Time</th>
                <th>Min</th>
                <th>Job / client</th>
                <th>Entered by</th>
                <th>Created</th>
                <th>Edits</th>
              </tr>
            </thead>
            <tbody>
              {week.intervals.map((iv) => {
                const isHover = Boolean(hover && iv.id === hover)
                return (
                  <tr key={iv.id} id={iv.id} tabIndex={0} className={isHover ? 'flag-hover' : undefined}>
                    <td>
                      {localHHMM(iv.startedAt.getTime(), tz)}–
                      {localHHMM(iv.endedAt.getTime(), tz)}
                    </td>
                    <td>{iv.minutes}</td>
                    <td>
                      {iv.jobName} / {iv.clientName}
                    </td>
                    <td>{iv.createdByName}</td>
                    <td>{localDateTimeOf(iv.createdAt.getTime(), tz)}</td>
                    <td>{iv.editCount}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Red flags ({week.flags.length})</h2>
        <RedFlagList
          flags={week.flags}
          onHover={setHover}
          onFocus={(intervalId) => {
            if (!intervalId) return
            const el = document.getElementById(intervalId)
            if (!el) return
            el.scrollIntoView({ block: 'nearest' })
            ;(el as HTMLElement).focus()
          }}
        />
      </section>

      {isBilling && week.status === 'submitted' ? (
        <section className="card approverview-actions">
          <h2>Approve / reject</h2>
          <ActionForm
            schema={CommentSchema}
            fields={[{ name: 'comment', placeholder: 'Optional comment' }]}
            buttonLabel="Approve"
            buttonClass="approverview-approve"
            onSubmit={async (vals) => {
              await approveWeekFn({ data: { ...target, comment: (vals.comment as string) || undefined } })
              await onAction()
            }}
          />
          <ActionForm
            schema={ReasonSchema}
            fields={[{ name: 'reason', placeholder: 'Reason (required)', required: true }]}
            buttonLabel="Reject"
            buttonClass="approverview-reject"
            onSubmit={async (vals) => {
              await rejectWeekFn({ data: { ...target, reason: vals.reason as string } })
              await onAction()
            }}
          />
        </section>
      ) : null}

      {isAdmin && week.status === 'approved' ? (
        <section className="card approverview-actions">
          <h2>Unlock</h2>
          <ActionForm
            schema={ReasonSchema}
            fields={[{ name: 'reason', placeholder: 'Reason (required)', required: true }]}
            buttonLabel="Unlock"
            buttonClass="approverview-unlock"
            onSubmit={async (vals) => {
              await unlockWeekFn({ data: { ...target, reason: vals.reason as string } })
              await onAction()
            }}
          />
        </section>
      ) : null}

      <section className="card">
        <h2>Audit trail</h2>
        {week.events.length === 0 ? (
          <div className="lanebody-empty">No events yet.</div>
        ) : (
          <ol className="audit-trail">
            {week.events.map((e) => (
              <li key={e.id}>
                <span className="audit-at">{localDateTimeOf(e.at.getTime(), tz)}</span>
                <span className="audit-kind">{EVENT_LABEL[e.kind] ?? e.kind}</span>
                <span className="audit-actor">{e.actorName}</span>
                {e.reason ? <span className="audit-reason">— {e.reason}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function ActionForm({
  schema,
  fields,
  buttonLabel,
  buttonClass,
  onSubmit,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any
  fields: { name: string; placeholder: string; required?: boolean }[]
  buttonLabel: string
  buttonClass: string
  onSubmit: (vals: Record<string, string>) => Promise<void>
}) {
  const form = useForm({
    defaultValues: Object.fromEntries(fields.map((f) => [f.name, ''])),
    validators: { onChange: schema },
    onSubmit: async ({ value }) => {
      try {
        await onSubmit(value as Record<string, string>)
      } catch (e) {
        applyServerError(form, e)
        throw e
      }
    },
  })
  return (
    <form
      className="approverview-form"
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      {fields.map((f) => (
        <form.Field key={f.name} name={f.name}>
          {(field) => (
            <input
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder={f.placeholder}
              maxLength={500}
              required={f.required}
            />
          )}
        </form.Field>
      ))}
      <button type="submit" className={buttonClass}>
        {buttonLabel}
      </button>
    </form>
  )
}
