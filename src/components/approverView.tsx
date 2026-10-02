import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { Check, Unlock, X } from 'reicon-react'
import { applyServerError } from '~/components/forms/applyServerError'
import { formatWeekLabel, localDateTimeOf, localHHMM } from '~/lib/dayMath'
import { formatCents } from '~/lib/money'
import { RedFlagList } from '~/components/redFlagList'
import { TrioChip } from '~/components/trioChip'
import { StatusChip } from '~/components/ui/chip'
import { Button } from '~/components/ui/button'
import { STATUS_LABEL } from '~/components/weekStatus'
import type { Role } from '~/server/context'
import { approveWeekFn, rejectWeekFn, unlockWeekFn } from '~/server/fns/approvals'
import type { WeekForApproval, IntervalEventView } from '~/server/services/approvals'

const EVENT_LABEL: Record<WeekForApproval['events'][number]['kind'], string> = {
  submit: 'Submitted',
  approve: 'Approved',
  reject: 'Sent back',
  unlock: 'Unlocked',
  edited_after_submit: 'Edited after submitting',
}

const INTERVAL_EVENT_LABEL: Record<IntervalEventView['kind'], string> = {
  create: 'Entry created',
  edit: 'Entry edited',
  delete: 'Entry deleted',
}

function changesText(changes: Record<string, { from: unknown; to: unknown }>): string {
  const short = (v: unknown) => {
    if (v == null) return '(none)'
    const s = String(v)
    return s.length > 30 ? `${s.slice(0, 30)}…` : s === '' ? '(blank)' : s
  }
  return Object.entries(changes)
    .map(([k, { from: f, to: t }]) => `${k}: ${short(f)} → ${short(t)}`)
    .join('; ')
}

const ACTION_ICON = { primary: Check, destructive: X, secondary: Unlock } as const

const badgeKind = {
  none: 'outline',
  draft: 'outline',
  submitted: 'inverse',
  approved: 'solid',
  rejected: 'error',
} as const

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
  // C2: the rate column appears only when rows carry the (money-gated) key.
  const showRate = week.intervals.some((iv) => 'rateCents' in iv)
  const target = { workerId: week.workerId, weekStart: week.weekStart }

  return (
    <div className="approverview">
      <header className="approverview-head">
        <div>
          <h2>{week.workerName}</h2>
          <span className="approverview-week">{formatWeekLabel(week.weekStart)}</span>
          <StatusChip kind={badgeKind[week.status]} style={{ marginLeft: 12 }}>
            {STATUS_LABEL[week.status]}
          </StatusChip>
        </div>
        <TrioChip recon={week.recon} size="lg" />
      </header>

      <section className="card">
        <h2>Entries ({week.intervals.length})</h2>
        {week.intervals.length === 0 ? (
          <div className="lanebody-empty">No entries this week.</div>
        ) : (
          <>
            {week.unassignedIntervalIds.length > 0 ? (
              <p className="status-msg">
                {week.unassignedIntervalIds.length} entries on jobs this worker is not assigned to
              </p>
            ) : null}
            <table className="intervalaudit">
            <thead>
              <tr>
                <th>Time</th>
                <th>Min</th>
                <th>Job / client</th>
                <th>Entered by</th>
                <th>Created</th>
                <th>Edits</th>
                {showRate ? <th>Rate</th> : null}
              </tr>
            </thead>
            <tbody>
              {week.intervals.map((iv) => {
                const isHover = Boolean(hover && iv.id === hover)
                const isUnassigned = week.unassignedIntervalIds.includes(iv.id)
                return (
                  <tr
                    key={iv.id}
                    id={iv.id}
                    tabIndex={0}
                    className={`${isHover ? 'flag-hover ' : ''}${isUnassigned ? 'unassigned' : ''}`.trim() || undefined}
                  >
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
                    {showRate ? (
                      <td className="mono">{iv.rateCents == null ? '—' : `${formatCents(iv.rateCents)}/h`}</td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
          </>
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
            buttonVariant="primary"
            onSubmit={async (vals) => {
              await approveWeekFn({ data: { ...target, comment: (vals.comment as string) || undefined } })
              await onAction()
            }}
          />
          <ActionForm
            schema={ReasonSchema}
            fields={[{ name: 'reason', placeholder: 'Reason (required)', required: true }]}
            buttonLabel="Reject"
            buttonVariant="destructive"
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
            buttonVariant="secondary"
            onSubmit={async (vals) => {
              await unlockWeekFn({ data: { ...target, reason: vals.reason as string } })
              await onAction()
            }}
          />
        </section>
      ) : null}

      <section className="card">
        <h2>Audit trail</h2>
        {(() => {
          // C1: approval events + interval events merged, newest first
          // (stable sort keeps same-instant rows in approval-then-interval order).
          const trail: { key: string; at: Date; kind: string; actor: string; detail: string | null }[] = [
            ...week.events.map((e) => ({ key: e.id, at: e.at, kind: EVENT_LABEL[e.kind] ?? e.kind, actor: e.actorName, detail: e.reason ?? null })),
            ...week.intervalEvents.map((e) => ({
              key: e.id,
              at: e.at,
              kind: INTERVAL_EVENT_LABEL[e.kind],
              actor: e.actorName,
              detail: e.changes ? changesText(e.changes) : null,
            })),
          ].sort((a, b) => b.at.getTime() - a.at.getTime())
          if (trail.length === 0) return <div className="lanebody-empty">No events yet.</div>
          return (
            <ol className="audit-trail">
              {trail.map((t) => (
                <li key={t.key}>
                  <span className="audit-at">{localDateTimeOf(t.at.getTime(), tz)}</span>
                  <span className="audit-kind">{t.kind}</span>
                  <span className="audit-actor">{t.actor}</span>
                  {t.detail ? <span className="audit-reason">— {t.detail}</span> : null}
                </li>
              ))}
            </ol>
          )
        })()}
      </section>
    </div>
  )
}

function ActionForm({
  schema,
  fields,
  buttonLabel,
  buttonVariant,
  onSubmit,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any
  fields: { name: string; placeholder: string; required?: boolean }[]
  buttonLabel: string
  buttonVariant: 'primary' | 'secondary' | 'destructive'
  onSubmit: (vals: Record<string, string>) => Promise<void>
}) {
  const ActionIcon = ACTION_ICON[buttonVariant]
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
      <Button type="submit" size="sm" variant={buttonVariant}>
        <ActionIcon size={13} /> {buttonLabel}
      </Button>
    </form>
  )
}
