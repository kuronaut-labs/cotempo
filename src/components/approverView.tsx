import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { applyServerError } from '~/components/forms/applyServerError'
import { isHttpError } from '~/lib/errors'
import { localHHMM } from '~/lib/dayMath'
import { RedFlagList } from '~/components/redFlagList'
import { TrioChip } from '~/components/trioChip'
import type { Role } from '~/server/context'
import { approveWeekFn, rejectWeekFn, unlockWeekFn } from '~/server/fns/approvals'
import type { WeekForApproval } from '~/server/services/approvals'

const CommentSchema = z.object({ comment: z.string().max(500).optional() })
const ReasonSchema = z.object({ reason: z.string().min(1, 'Reason required').max(500) })

export function ApproverView({
  week,
  role,
  onAction,
}: {
  week: WeekForApproval
  role: Role[]
  onAction: () => Promise<void>
}) {
  const [hover, setHover] = useState<string | undefined>(undefined)
  const isAdmin = role.includes('admin')
  const isBilling = role.includes('billing') || isAdmin
  const showTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const target = { workerId: week.workerId, weekStart: week.weekStart }

  return (
    <div className="approverview">
      <header className="approverview-head">
        <div>
          <h2>{week.workerName}</h2>
          <span className="approverview-week">{week.weekStart}</span>
          <span className={`weekstatus-badge ${week.status}`} style={{ marginLeft: 12 }}>
            {week.status}
          </span>
        </div>
        <TrioChip recon={week.recon} size="lg" />
      </header>

      <section className="card">
        <h2>Intervals ({week.intervals.length})</h2>
        {week.intervals.length === 0 ? (
          <div className="lanebody-empty">No intervals this week.</div>
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
                  <tr key={iv.id} className={isHover ? 'flag-hover' : undefined}>
                    <td>
                      {localHHMM(iv.startedAt.getTime(), showTz)}–
                      {localHHMM(iv.endedAt.getTime(), showTz)}
                    </td>
                    <td>{iv.minutes}</td>
                    <td>
                      {iv.jobName} / {iv.clientName}
                    </td>
                    <td>{iv.createdByName}</td>
                    <td>{iv.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</td>
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
        <RedFlagList flags={week.flags} onHover={setHover} />
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
                <span className="audit-at">{e.at.toISOString().slice(0, 16).replace('T', ' ')}</span>
                <span className="audit-kind">{e.kind}</span>
                <span className="audit-actor">{e.actorName}</span>
                {e.reason ? <span className="audit-reason">— {e.reason}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <span style={{ display: 'none' }} aria-hidden>
        {isHttpError.name}
      </span>
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
