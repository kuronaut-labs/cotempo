import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { ApprovalsQueue } from '~/components/approvalsQueue'
import { ApproverView } from '~/components/approverView'
import { WeekStatus } from '~/components/weekStatus'
import { canSeeMoney, hasRole, type SessionContext } from '~/server/context'
import { getSessionCtxFn } from '~/server/fns/auth'
import { getWeekForApprovalFn, listMyWeeksFn, listPendingWeeksFn, submitWeekFn } from '~/server/fns/approvals'
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
    if (!ctx) return { ctx: null as SessionContext | null }
    const canApprove = hasRole(ctx, 'billing')
    if (canApprove) {
      const queue = await listPendingWeeksFn()
      let view: WeekForApproval | null = null
      if (deps.worker && deps.week) {
        view = await getWeekForApprovalFn({ data: { workerId: deps.worker, weekStart: deps.week } })
      }
      return { ctx, mode: 'approver' as const, queue, view, selected: deps.worker && deps.week ? { workerId: deps.worker, weekStart: deps.week } : null }
    }
    const weeks = await listMyWeeksFn({ data: { weeks: 8 } })
    let view: WeekForApproval | null = null
    if (deps.worker && deps.week) {
      view = await getWeekForApprovalFn({ data: { workerId: deps.worker, weekStart: deps.week } })
    }
    const workers = await listWorkersFn()
    return { ctx, mode: 'operator' as const, weeks, view, workers, selected: deps.worker && deps.week ? { workerId: deps.worker, weekStart: deps.week } : null }
  },
  component: ApprovalsView,
})

function goSearch(navigate: ReturnType<typeof useNavigate>, next: { worker?: string; week?: string }) {
  navigate({ to: '/approvals', search: (prev) => ({ ...prev, ...next }) })
}

function ApprovalsView() {
  const data = Route.useLoaderData() as
    | { ctx: null }
    | { ctx: SessionContext; mode: 'approver'; queue: PendingWeek[]; view: WeekForApproval | null; selected: { workerId: string; weekStart: string } | null }
    | { ctx: SessionContext; mode: 'operator'; weeks: MyWeek[]; view: WeekForApproval | null; workers: { workerId: string; name: string; kind: 'human' | 'agent' }[]; selected: { workerId: string; weekStart: string } | null }
  const navigate = useNavigate()
  const router = (Route as unknown as { useRouter?: () => { invalidate: () => Promise<void> } }).useRouter?.()
  const invalidate = async () => {
    if (router) await router.invalidate()
  }

  if (!data.ctx) {
    return <main className="approvals">Sign in to view approvals.</main>
  }
  const showMoney = canSeeMoney(data.ctx)

  if (data.mode === 'approver') {
    return (
      <main className="approvals">
        <header className="approvals-head">
          <h1>Approvals queue</h1>
          <span className="approvals-count">{data.queue.length} submitted</span>
        </header>
        <div className="approvals-split">
          <aside className="approvals-queue-pane">
            <ApprovalsQueue
              weeks={data.queue}
              selected={data.selected ?? undefined}
              onSelect={(w) => goSearch(navigate, { worker: w.workerId, week: w.weekStart })}
            />
          </aside>
          <section className="approvals-detail-pane">
            {data.view ? (
              <ApproverView week={data.view} role={data.ctx.roles} onAction={invalidate} />
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
            {data.weeks.map((w) => {
              const isSel = data.selected && data.selected.workerId === w.workerId && data.selected.weekStart === w.weekStart
              return (
                <li key={`${w.workerId}-${w.weekStart}`} className={isSel ? 'selected' : undefined}>
                  <button type="button" onClick={() => goSearch(navigate, { worker: w.workerId, week: w.weekStart })}>
                    <div className="nm">{data.workers.find((x) => x.workerId === w.workerId)?.name ?? w.workerId}</div>
                    <div className="wk">{w.weekStart}</div>
                    <WeekStatusChip week={w} />
                  </button>
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

function WeekStatusChip({ week }: { week: MyWeek }) {
  const canSubmit = true // for self in the My Weeks list
  const hasIntervals = week.status !== 'none' || true // the user is on this page because they have data
  return (
    <WeekStatus
      week={week}
      canSubmit={canSubmit}
      hasIntervals={hasIntervals}
      onSubmit={async () => {
        // Submit through the fn so the role check runs server-side.
        await submitWeekFn({ data: { workerId: week.workerId, weekStart: week.weekStart } })
      }}
    />
  )
}

void submitWeekSvc
void assertCanEditWorker
