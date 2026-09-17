import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { X } from 'reicon-react'
import { Button } from '~/components/ui/button'
import { DateNav } from '~/components/dateNav'
import { DayMathChip } from '~/components/dayMathChip'
import { EntryForm, type Initial } from '~/components/entryForm'
import { IntervalList } from '~/components/intervalList'
import { MiniStrip } from '~/components/miniStrip'
import { parseHttpError } from '~/lib/errors'
import { serverErrorMessage } from '~/components/forms/applyServerError'
import type { CreateIntervalInput, UpdateIntervalInput } from '~/lib/schemas/intervals'
import { getSessionCtxFn } from '~/server/fns/auth'
import {
  createIntervalFn,
  deleteIntervalFn,
  getTodayFn,
  getRecentJobsFn,
  listDayFn,
  updateIntervalFn,
} from '~/server/fns/intervals'
import { listStructureFn } from '~/server/fns/structure'
import { listWorkersFn } from '~/server/fns/workers'
import type { DayIntervalRow } from '~/server/services/intervals'
import type { SessionContext } from '~/server/context'

const todaySearch = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional(),
})

export const Route = createFileRoute('/_app/today')({
  validateSearch: todaySearch,
  loaderDeps: ({ search: { date } }) => ({ date }),
  loader: async ({ deps }) => {
    // Fetched even when the URL has a date: DateNav's "Today" needs the real one (#23).
    const todayP = getTodayFn()
    const date = deps.date ?? (await todayP).date
    const ctxP = getSessionCtxFn()
    const [ctx, day, structure, workers, today] = await Promise.all([
      ctxP,
      listDayFn({ data: { date } }),
      listStructureFn({ data: { includeArchived: false } }),
      listWorkersFn(),
      todayP,
    ])
    // Recent jobs for the self-worker (the entry form's worker select defaults to self).
    // Scope to the operator's own work — supervisees see their own recent jobs too.
    const recentJobs = ctx && (ctx.workerId || ctx.superviseeWorkerIds[0])
      ? await getRecentJobsFn({ data: { workerId: ctx.workerId || ctx.superviseeWorkerIds[0]! } })
      : []
    return { today: today.date, tz: today.tz, ctx, day, structure, workers, recentJobs }
  },
  component: TodayView,
})

type WorkerRow = { workerId: string; kind: 'human' | 'agent'; name: string }

function TodayView() {
  const { today, tz, ctx, day, structure, workers, recentJobs } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  const date = search.date ?? today
  const invalidate = () => router.invalidate()

  const jobColorIndex = colorIndexFromStructure(structure)
  const scope = scopeWorkerIds(ctx)
  const lanes = orderLanes(workers, scope, ctx?.workerId)

  const canEditRow = (workerId: string) =>
    Boolean(ctx && (ctx.workerId === workerId || ctx.superviseeWorkerIds.includes(workerId)))

  const [editing, setEditing] = useState<DayIntervalRow | null>(null)
  const [lockedWeek, setLockedWeek] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // P3.20: dismissible "How time is counted" explainer, shown once per browser.
  const [showHowCounted, setShowHowCounted] = useState(false)
  useEffect(() => {
    try {
      if (window.localStorage.getItem('timesheets:how-time-counted-dismissed') !== '1') setShowHowCounted(true)
    } catch {}
  }, [])
  const dismissHowCounted = () => {
    setShowHowCounted(false)
    try {
      window.localStorage.setItem('timesheets:how-time-counted-dismissed', '1')
    } catch {}
  }

  const noteLock = (e: unknown) => {
    // Defensive: server-fn errors may arrive as a plain object that lost the
    // HttpError prototype over the wire (#M11). parseHttpError handles both.
    const parsed = parseHttpError(e)
    if (parsed?.code === 'WEEK_LOCKED') {
      setLockedWeek(typeof parsed.data?.weekStart === 'string' ? parsed.data.weekStart : null)
    }
  }

  async function submit(input: CreateIntervalInput | UpdateIntervalInput) {
    setActionError(null)
    try {
      if ('id' in input) await updateIntervalFn({ data: input })
      else await createIntervalFn({ data: input })
      setEditing(null)
      setLockedWeek(null)
      await invalidate()
    } catch (e) {
      noteLock(e)
      setActionError(serverErrorMessage(e))
      throw e
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this interval?')) return
    setActionError(null)
    try {
      await deleteIntervalFn({ data: { id } })
      setLockedWeek(null)
      await invalidate()
    } catch (e) {
      noteLock(e)
      // Surface non-WEEK_LOCKED errors to the user instead of swallowing them
      // (entryForm catches its own errors, but delete has no enclosing form). (#L3)
      const parsed = parseHttpError(e)
      if (!parsed || parsed.code !== 'WEEK_LOCKED') {
        setActionError(serverErrorMessage(e))
      }
    }
  }

  return (
    <main className="today">
      <DateNav
        date={date}
        today={today}
        onChange={(next) => navigate({ to: '/today', search: next === today ? {} : { date: next } })}
      />

      <div className="today-lanes">
        {lanes.map((w) => {
          const intervals = day.intervals.filter((i) => i.workerId === w.workerId)
          const trio = day.trioByWorker[w.workerId] ?? { wallClockMin: 0, effortMin: 0, premiumMin: 0 }
          return (
            <section key={w.workerId} className="panel today-lane">
              <header className="today-lane-head">
                <h2>{w.name}</h2>
                <DayMathChip trio={trio} />
              </header>
              <MiniStrip
                day={day.day}
                tz={tz}
                intervals={intervals.map((i) => ({
                  id: i.id,
                  jobId: i.jobId,
                  startMs: i.startedAt.getTime(),
                  endMs: i.endedAt.getTime(),
                }))}
                jobColorIndex={jobColorIndex}
              />
              <IntervalList
                rows={intervals}
                tz={tz}
                canEdit={canEditRow}
                onEdit={(id) => {
                  setEditing(intervals.find((i) => i.id === id) ?? null)
                  setLockedWeek(null)
                }}
                onDelete={remove}
              />
            </section>
          )
        })}
      </div>

      {showHowCounted && (
        <aside className="how-counted-card" role="region" aria-label="How time is counted">
          <Button variant="ghost" size="sm" onClick={dismissHowCounted} aria-label="Dismiss">
            <X size={13} />
          </Button>
          <h2>How time is counted</h2>
          <p>Three numbers over the same day:</p>
          <ul>
            <li><b>On the clock</b> — time covered. 9:00–17:00 is 8:00, even if three jobs overlapped.</li>
            <li><b>Total of entries</b> — what you'd get by adding every entry, including ones that overlap.</li>
            <li><b>Overlap</b> — the difference. Extra minutes from working two jobs at once.</li>
          </ul>
          <p>Overlap is what gets billed when shared time is counted once per job — the audit disclosure on invoices.</p>
        </aside>
      )}

      {ctx && (
        <section className="panel">
          <h2 className="today-section-title">{editing ? 'Edit interval' : 'Add interval'}</h2>
          <EntryForm
            key={editing?.id ?? 'new'}
            date={date}
            tz={tz}
            selfWorkerId={ctx.workerId}
            superviseeWorkerIds={ctx.superviseeWorkerIds}
            workers={workers}
            structure={structure}
            recentJobs={recentJobs}
            initial={rowToInitial(editing)}
            onSubmit={submit}
            onCancel={() => setEditing(null)}
          />
          {/* Plan 4.4d: link to /approvals?worker=&week= once that route exists (4.6). */}
          {lockedWeek && (
            <p role="alert" className="form-error">
              Week {lockedWeek} is approved. Ask an admin to unlock it before editing intervals on it.
            </p>
          )}
          {actionError && (
            <p role="alert" className="form-error">
              {actionError}
            </p>
          )}
        </section>
      )}
    </main>
  )
}

function rowToInitial(row: DayIntervalRow | null): Initial | undefined {
  if (!row) return undefined
  return {
    id: row.id,
    workerId: row.workerId,
    jobId: row.jobId,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt.toISOString(),
    note: row.note,
  }
}

function colorIndexFromStructure(structure: { projects: { jobs: { id: string }[] }[] }[]): Record<string, number> {
  const out: Record<string, number> = {}
  let n = 0
  for (const c of structure) for (const p of c.projects) for (const j of p.jobs) out[j.id] = (n++ % 5) + 1
  return out
}

// null = no filter (billing/admin); mirrors assertCanViewWorker for the lane list.
function scopeWorkerIds(ctx: SessionContext | null): Set<string> | null {
  if (!ctx) return null
  if (ctx.roles.includes('billing') || ctx.roles.includes('admin')) return null
  return new Set([ctx.workerId, ...ctx.superviseeWorkerIds])
}

function orderLanes(workers: WorkerRow[], scope: Set<string> | null, selfId?: string): WorkerRow[] {
  const filtered = scope ? workers.filter((w) => scope.has(w.workerId)) : workers
  const self = selfId ? filtered.find((w) => w.workerId === selfId) : undefined
  const rest = filtered.filter((w) => !self || w.workerId !== self.workerId)
  return self ? [self, ...rest] : rest
}
