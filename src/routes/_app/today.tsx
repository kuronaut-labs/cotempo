import { useRef, useState } from 'react'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { Button } from '~/components/ui/button'
import { DateNav } from '~/components/dateNav'
import { DayMathChip } from '~/components/dayMathChip'
import { EntryForm, type Initial } from '~/components/entryForm'
import { IntervalList } from '~/components/intervalList'
import { AssignmentsStrip } from '~/components/assignmentsStrip'
import { MiniStrip } from '~/components/miniStrip'
import { localHHMM } from '~/lib/dayMath'
import { colorIndexFromStructure } from '~/lib/jobColors'
import { HowCounted } from '~/components/howCounted'
import { parseHttpError } from '~/lib/errors'
import { listAssignmentsFn } from '~/server/fns/assignments'
import { allocationReportFn } from '~/server/fns/allocations'
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
    const [ctx, day, structure, workers, today, assignments, allocations] = await Promise.all([
      ctxP,
      listDayFn({ data: { date } }),
      listStructureFn({ data: { includeArchived: false } }),
      listWorkersFn(),
      todayP,
      listAssignmentsFn({ data: {} }),
      allocationReportFn({ data: {} }),
    ])
    // Recent jobs for the self-worker (the entry form's worker select defaults to self).
    // Scope to the operator's own work — supervisees see their own recent jobs too.
    const recentJobs = ctx && (ctx.workerId || ctx.superviseeWorkerIds[0])
      ? await getRecentJobsFn({ data: { workerId: ctx.workerId || ctx.superviseeWorkerIds[0]! } })
      : []
    return { today: today.date, tz: today.tz, ctx, day, structure, workers, recentJobs, assignments, allocations }
  },
  component: TodayView,
})

type WorkerRow = { workerId: string; kind: 'human' | 'agent'; name: string }

function TodayView() {
  const { today, tz, ctx, day, structure, workers, recentJobs, assignments, allocations } = Route.useLoaderData()
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
  // LD10: an empty lane of "someone else" collapses; 'Add' opens the compact form with Worker preset.
  const [presetWorker, setPresetWorker] = useState<string | null>(null)
  // LD3: which lane's expand toggle is open (collapsed lanes can still be expanded by name click).
  const [expandedLanes, setExpandedLanes] = useState<Set<string>>(new Set())
  const [hoverId, setHoverId] = useState<string | null>(null)
  // + Overlap gesture (LD6): clone the row's span but no job — the picker lands focused.
  const [prefill, setPrefill] = useState<Initial | null>(null)
  const addPanelRef = useRef<HTMLElement>(null)
  // Every path that opens the form (edit, + Overlap, drag, collapsed-lane Add)
  // also scrolls it into view — on phones the form is above the fold, the
  // trigger is not, and a silent off-screen form reads as a dead button.
  const focusAddPanel = () => addPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
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
      let flashId: string | null = null
      if ('id' in input) await updateIntervalFn({ data: input })
      else {
        const row = await createIntervalFn({ data: input })
        flashId = row.id
      }
      setEditing(null)
      setPrefill(null)
      setPresetWorker(null)
      setLockedWeek(null)
      await invalidate()
      // Success acknowledgment: the new row pulses in place via the shared
      // strip ↔ row hover highlight (#P2-1).
      if (flashId) {
        setHoverId(flashId)
        window.setTimeout(() => setHoverId((cur) => (cur === flashId ? null : cur)), 1600)
      }
    } catch (e) {
      noteLock(e)
      setActionError(serverErrorMessage(e))
      throw e
    }
  }

  async function remove(id: string) {
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

  // LD8: latest entry end per worker on the shown day becomes the smart start default.
  const lastEndByWorker: Record<string, string> = {}
  for (const i of day.intervals) {
    const endHHMM = localHHMM(i.endedAt.getTime(), tz)
    const prev = lastEndByWorker[i.workerId]
    // Lexicographic works: both are zero-padded HH:MM.
    if (!prev || endHHMM > prev) lastEndByWorker[i.workerId] = endHHMM
  }

  return (
    <main className="today">
      <DateNav
        date={date}
        today={today}
        onChange={(next) => navigate({ to: '/today', search: next === today ? {} : { date: next } })}
      />

      {ctx && (
        <section className="panel today-add" ref={addPanelRef}>
          <EntryForm
            date={date}
            tz={tz}
            selfWorkerId={ctx.workerId}
            superviseeWorkerIds={ctx.superviseeWorkerIds}
            workers={workers}
            structure={structure}
            recentJobs={recentJobs}
            assignments={assignments}
            heading={
              prefill
                ? `Add entry over ${localHHMM(Date.parse(prefill.startedAt ?? ''), tz)}–${localHHMM(Date.parse(prefill.endedAt ?? ''), tz)}`
                : editing
                  ? 'Edit entry'
                  : 'Add entry'
            }
            initial={
              rowToInitial(editing) ?? (prefill ?? (presetWorker ? { workerId: presetWorker } : undefined))
            }
            compact={editing === null}
            autoFocusJob={Boolean(prefill)}
            smart={{
              lastEndByWorker,
              isToday: date === today,
              nowHHMM: date === today ? localHHMM(Date.now(), tz) : '09:00',
            }}
            key={
              editing?.id ??
              (prefill ? `ov:${prefill.startedAt}:${prefill.endedAt}` : presetWorker ?? 'new')
            }
            onSubmit={submit}
            onCancel={() => {
              setEditing(null)
              setPrefill(null)
              setPresetWorker(null)
            }}
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

      <div className="today-lanes">
        {lanes.map((w) => {
          const intervals = day.intervals.filter((i) => i.workerId === w.workerId)
          const trio = day.trioByWorker[w.workerId] ?? { wallClockMin: 0, effortMin: 0, premiumMin: 0 }
          const isSelf = Boolean(ctx && ctx.workerId === w.workerId)
          const collapsed = intervals.length === 0 && !isSelf && !expandedLanes.has(w.workerId)
          if (collapsed) {
            return (
              <section key={w.workerId} className="panel today-lane collapsed">
                <button
                  type="button"
                  className="today-lane-head collapsed-head"
                  onClick={() => setExpandedLanes((s) => new Set(s).add(w.workerId))}
                >
                  <h2>{w.name}</h2>
                  <span className="lane-empty-note">nothing logged</span>
                  {ctx && canEditRow(w.workerId) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditing(null)
                        setPresetWorker(w.workerId)
                        focusAddPanel()
                      }}
                    >
                      Add
                    </Button>
                  ) : null}
                </button>
              </section>
            )
          }
          return (
            <section key={w.workerId} className="panel today-lane">
              <header className="today-lane-head">
                <h2>{w.name}</h2>
                <DayMathChip trio={trio} />
                {isSelf ? <HowCounted /> : null}
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
                jobNames={Object.fromEntries(intervals.map((i) => [i.jobId, i.jobName]))}
                highlightId={hoverId}
                onHover={setHoverId}
                onRangeSelect={
                  canEditRow(w.workerId)
                    ? (range) => {
                        setEditing(null)
                        setPresetWorker(null)
                        setPrefill({
                          workerId: w.workerId,
                          startedAt: new Date(range.startMs).toISOString(),
                          endedAt: new Date(range.endMs).toISOString(),
                        })
                        focusAddPanel()
                      }
                    : undefined
                }
              />
              <IntervalList
                rows={intervals}
                day={day.day}
                tz={tz}
                canEdit={canEditRow}
                onEdit={(id) => {
                  setEditing(intervals.find((i) => i.id === id) ?? null)
                  setPrefill(null)
                  setLockedWeek(null)
                  focusAddPanel()
                }}
                onDelete={remove}
                jobColorIndex={jobColorIndex}
                hoverId={hoverId}
                onHover={setHoverId}
                onOverlap={(id) => {
                  const r = intervals.find((i) => i.id === id)
                  if (!r) return
                  setEditing(null)
                  setPresetWorker(null)
                  setPrefill({ workerId: r.workerId, startedAt: r.startedAt.toISOString(), endedAt: r.endedAt.toISOString() })
                  focusAddPanel()
                }}
              />
            </section>
          )
        })}
      </div>

      {/* LD2 (#29): date nav → Add entry → own lane → other lanes; the
          assignments strip is planning context, so it follows the lanes. */}
      <AssignmentsStrip rows={allocations} workers={workers} />
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

// (moved to ~/lib/jobColors)

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
