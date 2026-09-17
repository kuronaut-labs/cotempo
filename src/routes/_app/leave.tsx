import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { useState } from 'react'
import { CalendarDays, Check, X } from 'reicon-react'
import { Button } from '~/components/ui/button'
import { StatusChip } from '~/components/ui/chip'
import { applyServerError, serverErrorMessage } from '~/components/forms/applyServerError'
import { formatHmm } from '~/lib/money'
import { hasRole } from '~/server/context'
import { getSessionCtxFn } from '~/server/fns/auth'
import {
  approveLeaveRequestFn,
  cancelLeaveRequestFn,
  leaveQueueFn,
  listLeaveTypesFn,
  myLeaveFn,
  rejectLeaveRequestFn,
  submitLeaveRequestFn,
} from '~/server/fns/leave'
import type { LeaveBalanceView, LeaveRequestView } from '~/server/fns/leave'

// LeaveRequestView carries startDay/endDay; inclusive day count derived here
const daysInclusive = (startDay: string, endDay: string) =>
  startDay && endDay
    ? Math.round((new Date(endDay).getTime() - new Date(startDay).getTime()) / 86_400_000) + 1
    : ''

const leaveBadgeKind = {
  submitted: 'inverse',
  approved: 'solid',
  rejected: 'error',
  cancelled: 'muted',
} as const

const STATUS_TEXT: Record<LeaveRequestView['status'], string> = {
  submitted: 'Waiting on approval',
  approved: 'Approved',
  rejected: 'Declined',
  cancelled: 'Cancelled',
}

// hours-per-day is operator input, converted to whole minutes before submit
const FormHours = z.number().min(0.25).max(24)

export const Route = createFileRoute('/_app/leave')({
  loader: async () => {
    const [mine, types] = await Promise.all([myLeaveFn(), listLeaveTypesFn()])
    const ctx = await getSessionCtxFn()
    const canModerate = !!ctx && (hasRole(ctx, 'billing') || hasRole(ctx, 'admin'))
    const queue = canModerate ? await leaveQueueFn() : []
    return {
      balances: mine.balances,
      requests: mine.requests,
      types: types.map((t) => ({ id: t.id, name: t.name })),
      canModerate,
      queue,
    }
  },
  component: LeavePage,
})

function LeavePage() {
  const router = useRouter()
  const { balances, requests, types, canModerate, queue } = Route.useLoaderData() as {
    balances: LeaveBalanceView[]
    requests: LeaveRequestView[]
    types: { id: string; name: string }[]
    canModerate: boolean
    queue: LeaveRequestView[]
  }

  const form = useForm({
    defaultValues: { typeId: '', startDay: '', endDay: '', hoursPerDay: 8, reason: '' },
    validators: {
      onSubmit: z.object({
        typeId: z.string().min(1, 'Pick a type'),
        startDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a start day'),
        endDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick an end day'),
        hoursPerDay: FormHours,
        reason: z.string().max(500),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await submitLeaveRequestFn({
          data: {
            typeId: value.typeId,
            startDay: value.startDay,
            endDay: value.endDay,
            minutesPerDay: Math.round(value.hoursPerDay * 60),
            reason: value.reason || undefined,
          },
        })
        form.reset()
        await router.invalidate()
      } catch (e) {
        applyServerError(form, e)
      }
    },
  })

  return (
    <main className="leave">
      <h1><CalendarDays size={18} /> Leave</h1>

      <section className="leave-balances">
        {balances.map((b) => (
          <div key={b.type.id} className="leave-balance">
            <div className="k">{b.type.name}</div>
            <div className="v">{formatHmm(b.availableMinutes)} available</div>
            <div className="hint">{formatHmm(b.pendingMinutes)} pending</div>
          </div>
        ))}
        {balances.length === 0 && <p className="tree-empty">No leave types yet.</p>}
      </section>

      {canModerate && (
        <section className="leavequeue">
          <h2 className="today-section-title">
            Waiting on you {queue.length > 0 && <span className="leavequeue-count">{queue.length}</span>}
          </h2>
          {queue.length === 0 && <p className="tree-empty">Nothing waiting on you.</p>}
          {queue.map((r) => {
            const days = daysInclusive(r.startDay, r.endDay)
            return (
              <div key={r.id} className="leavequeue-row">
                <div className="leavequeue-main">
                  <span className="leavequeue-who">{r.workerName}</span>
                  <span className="leavequeue-what">
                    {r.typeName} · {days} {String(days) === '1' ? 'day' : 'days'} · {formatHmm(r.minutes)}
                  </span>
                  <span className="leavequeue-days">{r.startDay} → {r.endDay}</span>
                  {r.reason && <span className="leavequeue-reason">{r.reason}</span>}
                </div>
                <ApproveReject requestId={r.id} onDone={() => void router.invalidate()} />
              </div>
            )
          })}
        </section>
      )}

      <form
        className="entryform"
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <div className="entryform-row">
          <form.Field name="typeId">
            {(field) => (
              <label className="field">
                <span>Type</span>
                <select
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                >
                  <option value="">Pick a type…</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
            )}
          </form.Field>
          <form.Field name="hoursPerDay">
            {(field) => (
              <label className="field">
                <span>Hours per day</span>
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="24"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(Number(e.target.value))}
                />
              </label>
            )}
          </form.Field>
        </div>
        <div className="entryform-row">
          <form.Field name="startDay">
            {(field) => (
              <label className="field">
                <span>First day</span>
                <input
                  type="date"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </label>
            )}
          </form.Field>
          <form.Field name="endDay">
            {(field) => (
              <label className="field">
                <span>Last day</span>
                <input
                  type="date"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </label>
            )}
          </form.Field>
        </div>
        <form.Field name="reason">
          {(field) => (
            <label className="field">
              <span>Reason (optional)</span>
              <textarea
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                maxLength={500}
              />
            </label>
          )}
        </form.Field>
        <div className="entryform-actions">
          <Button type="submit" variant="primary">Request leave</Button>
        </div>
      </form>

      {requests.length > 0 && (
        <table className="intervallist">
          <thead>
            <tr>
              <th>Type</th>
              <th>Days</th>
              <th>Hours</th>
              <th>Status</th>
              <th>Reason</th>
              <th>Decision</th>
              <th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{r.typeName}</td>
                <td className="mono">{daysInclusive(r.startDay, r.endDay)}</td>
                <td className="mono">{formatHmm(r.minutes)}</td>
                <td><StatusChip kind={leaveBadgeKind[r.status]}>{STATUS_TEXT[r.status]}</StatusChip></td>
                <td>{r.reason ?? ''}</td>
                <td>{r.decisionReason ?? ''}</td>
                <td className="intervallist-actions">
                  {r.status === 'submitted' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await cancelLeaveRequestFn({ data: { id: r.id } })
                        await router.invalidate()
                      }}
                    >
                      Cancel request
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {requests.length === 0 && <p className="tree-empty">No leave requests yet.</p>}
    </main>
  )
}

function ApproveReject({ requestId, onDone }: { requestId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  return (
    <div className="leavequeue-actions">
      <Button
        type="button"
        variant="primary"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError('')
          try {
            await approveLeaveRequestFn({ data: { id: requestId } })
            onDone()
          } catch (e) {
            setError(serverErrorMessage(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        <Check size={13} /> Approve
      </Button>
      <form
        className="leavequeue-reject"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!reason.trim()) {
            setError('A reason is required to decline.')
            return
          }
          setBusy(true)
          setError('')
          try {
            await rejectLeaveRequestFn({ data: { id: requestId, reason: reason.trim() } })
            setReason('')
            onDone()
          } catch (e) {
            setError(serverErrorMessage(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason"
          maxLength={500}
          aria-label="Reason to decline"
        />
        <Button type="submit" variant="destructive" size="sm" disabled={busy}>
          <X size={13} /> Decline
        </Button>
      </form>
      {error && <span className="field-error" role="alert">{error}</span>}
    </div>
  )
}
