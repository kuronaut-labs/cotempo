import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { FileDownload } from 'reicon-react'
import { ApprovalsQueue } from '~/components/approvalsQueue'
import { ApproverView } from '~/components/approverView'
import { WeekStatus } from '~/components/weekStatus'
import { Button } from '~/components/ui/button'
import { serverErrorMessage } from '~/components/forms/applyServerError'
import { canSeeMoney, hasRole, type SessionContext } from '~/server/context'
import { formatWeekLabel } from '~/lib/dayMath'
import { addDays, parseIsoDate, toIsoDate } from '~/lib/dateShift'
import { getSessionCtxFn } from '~/server/fns/auth'
import { approveWeeksBulkFn, getWeekForApprovalFn, listMyWeeksFn, listPendingWeeksFn, submitWeekFn, weeksWithEntriesFn } from '~/server/fns/approvals'
import { getTodayFn } from '~/server/fns/intervals'
import { exportCsvFn } from '~/server/fns/exports'
import { listWorkersFn } from '~/server/fns/workers'
import { submitWeek as submitWeekSvc } from '~/server/services/approvals'
import { assertCanEditWorker } from '~/server/guards/worker'
import type { MyWeek, PendingWeek, WeekForApproval } from '~/server/services/approvals'

const searchSchema = z.object({
  worker: z.string().min(1).optional(),
  week: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional(),
})

export const Route = createFileRoute('/_app/approvals')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ worker: search.worker, week: search.week }),
  loader: async ({ deps }) => {
    const ctx = await getSessionCtxFn()
    if (!ctx) return { ctx: null as SessionContext | null, tz: '' as string }
    const today = await getTodayFn()
    const tz = today.tz
    const canApprove = hasRole(ctx, 'billing')
    if (canApprove) {
      const queue = await listPendingWeeksFn()
      let view: WeekForApproval | null = null
      if (deps.worker && deps.week) {
        view = await getWeekForApprovalFn({ data: { workerId: deps.worker, weekStart: deps.week } })
      }
      return { ctx, tz, mode: 'approver' as const, queue, view, selected: deps.worker && deps.week ? { workerId: deps.worker, weekStart: deps.week } : null, today: today.date }
    }
    const weeks = await listMyWeeksFn({ data: { weeks: 8 } })
    const withEntries = await weeksWithEntriesFn({ data: { workerId: ctx.workerId, weekStarts: weeks.map((w) => w.weekStart) } })
    let view: WeekForApproval | null = null
    if (deps.worker && deps.week) {
      view = await getWeekForApprovalFn({ data: { workerId: deps.worker, weekStart: deps.week } })
    }
    const workers = await listWorkersFn()
    return { ctx, tz, mode: 'operator' as const, weeks, withEntries, view, workers, selected: deps.worker && deps.week ? { workerId: deps.worker, weekStart: deps.week } : null }
  },
  component: ApprovalsView,
})

function goSearch(navigate: ReturnType<typeof useNavigate>, next: { worker?: string; week?: string }) {
  navigate({ to: '/approvals', search: (prev) => ({ ...prev, ...next }) })
}

function ApprovalsView() {
  const data = Route.useLoaderData() as
    | { ctx: null }
    | { ctx: SessionContext; tz: string; mode: 'approver'; queue: PendingWeek[]; view: WeekForApproval | null; selected: { workerId: string; weekStart: string } | null; today: string }
    | { ctx: SessionContext; tz: string; mode: 'operator'; weeks: MyWeek[]; withEntries: string[]; view: WeekForApproval | null; workers: { workerId: string; name: string; kind: 'human' | 'agent' }[]; selected: { workerId: string; weekStart: string } | null }
  const navigate = useNavigate()
  const router = (Route as unknown as { useRouter?: () => { invalidate: () => Promise<void> } }).useRouter?.()
  const invalidate = async () => {
    if (router) await router.invalidate()
  }
  // C4: exception-based review hooks — declared before any early return.
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [bulkError, setBulkError] = useState('')

  if (!data.ctx) {
    return <main className="approvals">Sign in to view approvals.</main>
  }
  const showMoney = canSeeMoney(data.ctx)

  if (data.mode === 'approver') {
    const queue: PendingWeek[] = data.queue.filter((w) => !flaggedOnly || w.flagCount > 0)
    return (
      <main className="approvals">
        <header className="approvals-head">
          <h1>Approvals queue</h1>
          <span className="approvals-count">{data.queue.length} submitted</span>
          <span style={{ marginLeft: 'auto' }} />
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={async () => {
              const to = data.today
              const from = toIsoDate(addDays(parseIsoDate(to), -90))
              const res = await exportCsvFn({ data: { from, to, view: 'events' } })
              const blob = await res.blob()
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              const disp = res.headers.get('content-disposition') ?? ''
              const m2 = /filename="([^"]+)"/.exec(disp)
              a.download = m2?.[1] ?? `timesheets-${from}_${to}-events.csv`
              document.body.appendChild(a)
              a.click()
              a.remove()
              URL.revokeObjectURL(url)
            }}
          >
            <FileDownload size={13} /> Export audit log
          </Button>
        </header>
        <div className="approvals-split">
          <aside className="approvals-queue-pane">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
              <label className="checkline">
                <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
                Only weeks with flags
              </label>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={Object.values(checked).filter(Boolean).length === 0}
                onClick={async () => {
                  setBulkError('')
                  const weeks = queue
                    .filter((w) => checked[`${w.workerId}-${w.weekStart}`])
                    .map((w) => ({ workerId: w.workerId, weekStart: w.weekStart }))
                  try {
                    await approveWeeksBulkFn({ data: { weeks } })
                    setChecked({})
                    await invalidate()
                  } catch (e) {
                    setBulkError(serverErrorMessage(e))
                  }
                }}
              >
                Approve selected
              </Button>
            </div>
            {bulkError && <span className="field-error" role="alert">{bulkError}</span>}
            <ApprovalsQueue
              weeks={queue}
              selected={data.selected ?? undefined}
              onSelect={(w) => goSearch(navigate, { worker: w.workerId, week: w.weekStart })}
              checked={checked}
              onToggle={(k) => setChecked((prev) => ({ ...prev, [`${k.workerId}-${k.weekStart}`]: !prev[`${k.workerId}-${k.weekStart}`] }))}
            />
          </aside>
          <section className="approvals-detail-pane">
            {data.view ? (
              <ApproverView week={data.view} role={data.ctx.roles} tz={data.tz} onAction={invalidate} />
            ) : (
              <div className="approvals-empty">Select a submitted week to review.</div>
            )}
          </section>
        </div>
        <span style={{ display: 'none' }} aria-hidden>
          {showMoney ? 'money' : 'no-money'}
        </span>
      </main>
    )
  }

  // Operator view
  return (
    <main className="approvals">
      <header className="approvals-head">
        <h1>My weeks</h1>
      </header>
      <div className="approvals-split">
        <aside className="approvals-queue-pane">
          <ul className="approvalsqueue">
            {[...data.weeks].reverse().map((w) => {
              const isSel = data.selected && data.selected.workerId === w.workerId && data.selected.weekStart === w.weekStart
              return (
                <li key={`${w.workerId}-${w.weekStart}`} className={isSel ? 'selected' : undefined}>
                  <div
                    role="button"
                    tabIndex={0}
                    className={isSel ? 'queue-row selected' : 'queue-row'}
                    onClick={() => goSearch(navigate, { worker: w.workerId, week: w.weekStart })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        goSearch(navigate, { worker: w.workerId, week: w.weekStart })
                      }
                    }}
                  >
                    <div className="nm">{data.workers.find((x) => x.workerId === w.workerId)?.name ?? w.workerId}</div>
                    <div className="wk">{formatWeekLabel(w.weekStart)}</div>
                    <WeekStatusChip week={w} hasIntervals={data.withEntries.includes(w.weekStart)} onNavigate={() => goSearch(navigate, { worker: w.workerId, week: w.weekStart })} />
                  </div>
                </li>
              )
            })}
          </ul>
        </aside>
        <section className="approvals-detail-pane">
          {data.view ? (
            // Read-only: hide the form actions by passing a no-op onAction and a "viewer" role set
            <ApproverView
              week={data.view}
              role={[]}
              tz={data.tz}
              onAction={async () => {
                /* read-only */
              }}
            />
          ) : (
            <div className="approvals-empty">Select a week to view.</div>
          )}
        </section>
      </div>
    </main>
  )
}

function WeekStatusChip({ week, hasIntervals, onNavigate }: { week: MyWeek; hasIntervals: boolean; onNavigate?: () => void }) {
  return (
    <WeekStatus
      week={week}
      canSubmit
      hasIntervals={hasIntervals}
      onSubmit={async () => {
        // Submit through the fn so the role check runs server-side.
        await submitWeekFn({ data: { workerId: week.workerId, weekStart: week.weekStart } })
        onNavigate?.()
      }}
    />
  )
}

void submitWeekSvc
void assertCanEditWorker
