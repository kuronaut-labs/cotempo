import { and, asc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm'
import { explode, recon as piecesRecon, type Piece } from '~/lib/attribution'
import { localDateOf, localDayBoundariesUtcMs } from '~/lib/dayMath'
import { HttpError } from '~/lib/errors'
import { defaults as flagDefaults, redFlags, type Flag } from '~/lib/redFlags'
import { isMonday } from '~/lib/week'
import { getOrgSettings, type OrgSettingsView } from './settings'
import { canSeeMoney, hasRole, isAdmin, type SessionContext } from '~/server/context'
import { schema, type Db } from '~/server/db'
import { assertCanEditWorker, assertCanViewWorker } from '~/server/guards/worker'
import type {
  ApproveWeekInput,
  GetWeekInput,
  ListMyWeeksInput,
  RejectWeekInput,
  SubmitWeekInput,
  UnlockWeekInput,
} from '~/lib/schemas/approvals'
import type { TimeRecon } from './reports'
import type { Deps } from './deps'

export type ApprovalRow = typeof schema.approvals.$inferSelect
export type ApprovalEventRow = typeof schema.approvalEvents.$inferSelect
export type ApprovalStatus = ApprovalRow['status']

/* State machine (#12, #26).
   none|draft|rejected --submit--> submitted
   submitted           --approve--> approved      submitted --reject--> rejected
   approved            --unlock-->  draft (admin) submitted --edit--> draft (guards/week.ts)
   approve/reject refuse ctx.workerId === workerId unless isAdmin(ctx) → SELF_APPROVAL.
   weekStart must be a Monday → NOT_A_MONDAY. */

export type WeekIntervalAudit = {
  id: string
  jobName: string
  clientName: string
  startedAt: Date
  endedAt: Date
  minutes: number
  createdByName: string
  createdAt: Date
  editCount: number
  rateCents?: number | null // C2: omit-key for non-money viewers, #5
}

export type WeekForApproval = {
  workerId: string
  workerName: string
  weekStart: string
  status: ApprovalStatus | 'none'
  recon: TimeRecon & { cents?: number }
  intervals: WeekIntervalAudit[]
  flags: Flag[]
  events: (ApprovalEventRow & { actorName: string })[]
  intervalEvents: IntervalEventView[]
}

export type IntervalEventView = {
  id: string
  kind: 'create' | 'edit' | 'delete'
  at: Date
  actorName: string
  changes: Record<string, { from: string | number | null; to: string | number | null }> | null
}

export type PendingWeek = { workerId: string; workerName: string; weekStart: string; recon: TimeRecon & { cents?: number }; flagCount: number }
export type MyWeek = { workerId: string; weekStart: string; status: ApprovalStatus | 'none'; rejectedReason: string | null }

const DAY = 86_400_000

function assertMonday(weekStart: string) {
  if (!isMonday(weekStart)) throw new HttpError(400, 'NOT_A_MONDAY', 'weekStart')
}

function assertSelfApprovalOk(ctx: SessionContext, workerId: string) {
  if (ctx.workerId === workerId && !isAdmin(ctx)) throw new HttpError(409, 'SELF_APPROVAL')
}

async function loadApprovalRow(db: Db, workerId: string, weekStart: string): Promise<ApprovalRow | null> {
  const row = await db
    .select()
    .from(schema.approvals)
    .where(and(eq(schema.approvals.workerId, workerId), eq(schema.approvals.weekStart, weekStart)))
    .get()
  return row ?? null
}

async function workerNames(db: Db, workerIds: string[]): Promise<Map<string, string>> {
  if (workerIds.length === 0) return new Map()
  const rows = await db
    .select({
      workerId: schema.workers.id,
      workerName: schema.workers.name,
      userName: schema.user.name,
    })
    .from(schema.workers)
    .leftJoin(schema.humanWorkers, eq(schema.humanWorkers.workerId, schema.workers.id))
    .leftJoin(schema.user, eq(schema.user.id, schema.humanWorkers.userId))
    .where(inArray(schema.workers.id, workerIds))
    .all()
  return new Map(rows.map((r) => [r.workerId, r.userName ?? r.workerName ?? '?']))
}

async function workerSupervisors(db: Db, workerIds: string[]): Promise<Map<string, string | null>> {
  if (workerIds.length === 0) return new Map()
  const rows = await db
    .select({ id: schema.workers.id, supervisorId: schema.workers.supervisorId })
    .from(schema.workers)
    .where(inArray(schema.workers.id, workerIds))
    .all()
  return new Map(rows.map((r) => [r.id, r.supervisorId]))
}

async function loadIntervalsForWeek(db: Db, workerId: string, weekStart: string, tz: string) {
  const start = localDayBoundariesUtcMs(weekStart, tz).startMs
  const end = start + 7 * DAY
  return db
    .select({
      id: schema.intervals.id,
      workerId: schema.intervals.workerId,
      jobId: schema.intervals.jobId,
      rateCents: schema.intervals.rateCents,
      startedAt: schema.intervals.startedAt,
      endedAt: schema.intervals.endedAt,
      createdBy: schema.intervals.createdBy,
      createdAt: schema.intervals.createdAt,
      editCount: schema.intervals.editCount,
      jobName: schema.jobs.name,
      projectName: schema.projects.name,
      clientId: schema.projects.clientId,
      clientName: schema.clients.name,
    })
    .from(schema.intervals)
    .innerJoin(schema.jobs, eq(schema.jobs.id, schema.intervals.jobId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.jobs.projectId))
    .innerJoin(schema.clients, eq(schema.clients.id, schema.projects.clientId))
    .where(
      and(
        eq(schema.intervals.workerId, workerId),
        isNull(schema.intervals.deletedAt),
        lt(schema.intervals.startedAt, new Date(end)),
        gt(schema.intervals.endedAt, new Date(start)),
      ),
    )
    .orderBy(schema.intervals.startedAt)
    .all()
}

function toIntervalsForRedFlags(rows: Awaited<ReturnType<typeof loadIntervalsForWeek>>) {
  return rows.map((r) => ({
    id: r.id,
    startedAt: r.startedAt.getTime(),
    endedAt: r.endedAt.getTime(),
    createdAt: r.createdAt.getTime(),
    editCount: r.editCount,
    createdBy: r.createdBy,
  }))
}

function toPieces(rows: Awaited<ReturnType<typeof loadIntervalsForWeek>>, weekStart: string, tz: string): Piece[] {
  const weekStartMs = localDayBoundariesUtcMs(weekStart, tz).startMs
  const weekEndMs = weekStartMs + 7 * DAY
  const all: Piece[] = []
  for (const r of rows) {
    const pieces = explode(
      {
        id: r.id,
        workerId: r.workerId,
        jobId: r.jobId,
        clientId: r.clientId,
        startMs: r.startedAt.getTime(),
        endMs: r.endedAt.getTime(),
        rateCents: r.rateCents,
      },
      tz,
    )
    for (const p of pieces) {
      // Clip to the week window. loadIntervalsForWeek selects any interval that
      // *intersects* the week; a Sunday 23:00→Monday 01:00 interval otherwise
      // contributes the Monday minutes to *this* week and the same minutes to
      // the next week, double-counting across weeks. (#H4)
      const s = Math.max(p.startMs, weekStartMs)
      const e = Math.min(p.endMs, weekEndMs)
      if (s >= e) continue
      all.push({ ...p, startMs: s, endMs: e, day: s === p.startMs ? p.day : localDateOf(s, tz) })
    }
  }
  return all
}

function makeReconLiteral(r: ReturnType<typeof piecesRecon>, keepCents: boolean): TimeRecon & { cents?: number } {
  if (keepCents) return r
  const { cents: _drop, ...rest } = r
  return rest
}

async function loadEvents(db: Db, approvalId: string): Promise<ApprovalEventRow[]> {
  return db
    .select()
    .from(schema.approvalEvents)
    .where(eq(schema.approvalEvents.approvalId, approvalId))
    .orderBy(schema.approvalEvents.at)
    .all()
}

export async function submitWeek(deps: Deps, ctx: SessionContext, input: SubmitWeekInput): Promise<ApprovalRow> {
  const { db } = deps
  assertCanEditWorker(ctx, input.workerId)
  assertMonday(input.weekStart)
  const existing = await loadApprovalRow(db, input.workerId, input.weekStart)
  if (existing && (existing.status === 'submitted' || existing.status === 'approved')) {
    throw new HttpError(409, 'INVALID_TRANSITION')
  }
  const now = deps.now()
  const row: ApprovalRow = {
    id: existing?.id ?? `appr-${input.workerId}-${input.weekStart}`,
    workerId: input.workerId,
    weekStart: input.weekStart,
    status: 'submitted',
    submittedAt: now,
    submittedBy: ctx.workerId,
    approvedAt: existing?.approvedAt ?? null,
    approvedBy: existing?.approvedBy ?? null,
    approvedComment: existing?.approvedComment ?? null,
    rejectedAt: null,
    rejectedBy: null,
    rejectedReason: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  await db.insert(schema.approvals).values(row).onConflictDoUpdate({
    target: [schema.approvals.workerId, schema.approvals.weekStart],
    set: {
      status: 'submitted',
      submittedAt: now,
      submittedBy: ctx.workerId,
      rejectedReason: null,
      rejectedAt: null,
      rejectedBy: null,
      // Clear stale approved* fields so a resubmit-after-reject (or any other
      // path that left them populated) does not carry a prior approver's stamp
      // into the new 'submitted' state. (#M6)
      approvedAt: null,
      approvedBy: null,
      approvedComment: null,
      updatedAt: now,
    },
  })
  await db.insert(schema.approvalEvents).values({
    id: crypto.randomUUID(),
    approvalId: row.id,
    kind: 'submit',
    actorWorkerId: ctx.workerId,
    at: now,
  })
  return row
}

export async function approveWeek(deps: Deps, ctx: SessionContext, input: ApproveWeekInput): Promise<ApprovalRow> {
  if (!hasRole(ctx, 'billing')) throw new HttpError(403, 'FORBIDDEN')
  assertSelfApprovalOk(ctx, input.workerId)
  const { db } = deps
  const existing = await loadApprovalRow(db, input.workerId, input.weekStart)
  if (!existing || existing.status !== 'submitted') throw new HttpError(409, 'INVALID_TRANSITION')
  const now = deps.now()
  // Add `status = 'submitted'` to the where clause so a concurrent approve/reject
  // that already moved the row out of 'submitted' becomes a 0-row no-op rather
  // than overwriting the later transition. The pre-check above is the primary
  // guard; this closes the read-update race. (#M6)
  const updated = await db
    .update(schema.approvals)
    .set({
      status: 'approved',
      approvedAt: now,
      approvedBy: ctx.workerId,
      approvedComment: input.comment ?? null,
      updatedAt: now,
    })
    .where(and(eq(schema.approvals.id, existing.id), eq(schema.approvals.status, 'submitted')))
    .returning({ id: schema.approvals.id })
  if (updated.length === 0) throw new HttpError(409, 'INVALID_TRANSITION')
  await db.insert(schema.approvalEvents).values({
    id: crypto.randomUUID(),
    approvalId: existing.id,
    kind: 'approve',
    actorWorkerId: ctx.workerId,
    reason: input.comment ?? null,
    at: now,
  })
  return {
    ...existing,
    status: 'approved',
    approvedAt: now,
    approvedBy: ctx.workerId,
    approvedComment: input.comment ?? null,
    updatedAt: now,
  }
}

export async function rejectWeek(deps: Deps, ctx: SessionContext, input: RejectWeekInput): Promise<ApprovalRow> {
  if (!hasRole(ctx, 'billing')) throw new HttpError(403, 'FORBIDDEN')
  assertSelfApprovalOk(ctx, input.workerId)
  const { db } = deps
  const existing = await loadApprovalRow(db, input.workerId, input.weekStart)
  if (!existing || existing.status !== 'submitted') throw new HttpError(409, 'INVALID_TRANSITION')
  const now = deps.now()
  const updated = await db
    .update(schema.approvals)
    .set({
      status: 'rejected',
      rejectedAt: now,
      rejectedBy: ctx.workerId,
      rejectedReason: input.reason,
      updatedAt: now,
    })
    .where(and(eq(schema.approvals.id, existing.id), eq(schema.approvals.status, 'submitted')))
    .returning({ id: schema.approvals.id })
  if (updated.length === 0) throw new HttpError(409, 'INVALID_TRANSITION')
  await db.insert(schema.approvalEvents).values({
    id: crypto.randomUUID(),
    approvalId: existing.id,
    kind: 'reject',
    actorWorkerId: ctx.workerId,
    reason: input.reason,
    at: now,
  })
  return {
    ...existing,
    status: 'rejected',
    rejectedAt: now,
    rejectedBy: ctx.workerId,
    rejectedReason: input.reason,
    updatedAt: now,
  }
}

export async function unlockWeek(deps: Deps, ctx: SessionContext, input: UnlockWeekInput): Promise<ApprovalRow> {
  if (!isAdmin(ctx)) throw new HttpError(403, 'FORBIDDEN')
  const { db } = deps
  const existing = await loadApprovalRow(db, input.workerId, input.weekStart)
  if (!existing || existing.status !== 'approved') throw new HttpError(409, 'INVALID_TRANSITION')
  const now = deps.now()
  await db
    .update(schema.approvals)
    .set({ status: 'draft', approvedAt: null, approvedBy: null, approvedComment: null, updatedAt: now })
    .where(eq(schema.approvals.id, existing.id))
  await db.insert(schema.approvalEvents).values({
    id: crypto.randomUUID(),
    approvalId: existing.id,
    kind: 'unlock',
    actorWorkerId: ctx.workerId,
    reason: input.reason,
    at: now,
  })
  return { ...existing, status: 'draft', updatedAt: now, approvedAt: null, approvedBy: null, approvedComment: null }
}

/* A2: org-configurable thresholds; null falls back to redFlags' built-in defaults. */
function flagsCfg(s: OrgSettingsView) {
  return {
    gapMinWallMin: s.flagGapMinWallMin ?? flagDefaults.gapMinWallMin,
    lateEntryDays: s.flagLateEntryDays ?? flagDefaults.lateEntryDays,
    multiEditOver: s.flagMultiEditOver ?? flagDefaults.multiEditOver,
  }
}

export async function listPendingWeeks(deps: Deps, ctx: SessionContext): Promise<PendingWeek[]> {
  if (!hasRole(ctx, 'billing')) throw new HttpError(403, 'FORBIDDEN')
  const { db, tz } = deps
  const rows = await db
    .select()
    .from(schema.approvals)
    .where(eq(schema.approvals.status, 'submitted'))
    .all()
  if (rows.length === 0) return []
  const names = await workerNames(db, rows.map((r) => r.workerId))
  const supervisors = await workerSupervisors(db, rows.map((r) => r.workerId))
  const keepCents = canSeeMoney(ctx)
  const out: PendingWeek[] = []
  for (const r of rows) {
    const intervals = await loadIntervalsForWeek(db, r.workerId, r.weekStart, tz)
    const pieces = toPieces(intervals, r.weekStart, tz)
    const flagInput = {
      weekStart: r.weekStart,
      tz,
      worker: { id: r.workerId, supervisorId: supervisors.get(r.workerId) ?? null },
      intervals: toIntervalsForRedFlags(intervals),
      pieces,
    }
    const flags = redFlags(flagInput, flagsCfg(await getOrgSettings(deps, ctx)))
    out.push({
      workerId: r.workerId,
      workerName: names.get(r.workerId) ?? '?',
      weekStart: r.weekStart,
      recon: makeReconLiteral(piecesRecon(pieces), keepCents),
      flagCount: flags.length,
    })
  }
  return out
}

export async function getWeekForApproval(deps: Deps, ctx: SessionContext, input: GetWeekInput): Promise<WeekForApproval> {
  const { db, tz } = deps
  assertCanViewWorker(ctx, input.workerId)
  const row = await loadApprovalRow(db, input.workerId, input.weekStart)
  const intervals = await loadIntervalsForWeek(db, input.workerId, input.weekStart, tz)
  const pieces = toPieces(intervals, input.weekStart, tz)
  const keepCents = canSeeMoney(ctx)
  const r = piecesRecon(pieces)
  const recon = makeReconLiteral(r, keepCents)
  const intervalsAudit: WeekIntervalAudit[] = []
  if (intervals.length > 0) {
    const weekStartMs = localDayBoundariesUtcMs(input.weekStart, tz).startMs
    const weekEndMs = weekStartMs + 7 * DAY
    const creatorIds = [...new Set(intervals.map((i) => i.createdBy))]
    const creators = await workerNames(db, creatorIds)
    for (const i of intervals) {
      intervalsAudit.push({
        id: i.id,
        jobName: i.jobName,
        clientName: i.clientName,
        startedAt: i.startedAt,
        endedAt: i.endedAt,
        // Clip to the week window so audit minutes match the clipped recon — a
        // boundary-crossing interval otherwise shows minutes the approver is
        // not approving. (#H4)
        minutes: Math.max(
          0,
          Math.round(
            (Math.min(i.endedAt.getTime(), weekEndMs) - Math.max(i.startedAt.getTime(), weekStartMs)) / 60_000,
          ),
        ),
        createdByName: creators.get(i.createdBy) ?? '?',
        createdAt: i.createdAt,
        editCount: i.editCount,
        // #5: key present only for money viewers — never rateCents: undefined.
        ...(keepCents ? { rateCents: i.rateCents } : {}),
      })
    }
  }
  const supervisors = await workerSupervisors(db, [input.workerId])
  const flags = redFlags({
    weekStart: input.weekStart,
    tz,
    worker: { id: input.workerId, supervisorId: supervisors.get(input.workerId) ?? null },
    intervals: toIntervalsForRedFlags(intervals),
    pieces,
  }, flagsCfg(await getOrgSettings(deps, ctx)))
  const events: (ApprovalEventRow & { actorName: string })[] = []
  if (row) {
    const raw = await loadEvents(db, row.id)
    if (raw.length > 0) {
      const actors = await workerNames(db, raw.map((e) => e.actorWorkerId))
      for (const e of raw) events.push({ ...e, actorName: actors.get(e.actorWorkerId) ?? '?' })
    }
  }
  const wname = (await workerNames(db, [input.workerId])).get(input.workerId) ?? '?'
  // C1: merge interval events for this week's intervals into the audit data.
  const intervalEventViews: IntervalEventView[] = []
  if (intervals.length > 0) {
    const idList = intervals.map((i) => i.id)
    const rawIe = await db
      .select()
      .from(schema.intervalEvents)
      .where(inArray(schema.intervalEvents.intervalId, idList))
      .orderBy(asc(schema.intervalEvents.at), sql`rowid`) // rowid breaks same-instant ties (fixed clock)
      .all()
    if (rawIe.length > 0) {
      const actors = await workerNames(db, rawIe.map((e) => e.actorWorkerId))
      for (const e of rawIe) {
        // #5: rateCents is money — strip the diff for non-money viewers.
        let changes: IntervalEventView['changes'] = e.changes ? (JSON.parse(e.changes) as IntervalEventView['changes']) : null
        if (changes && !keepCents) {
          const { rateCents: _drop, ...rest } = changes
          changes = rest as IntervalEventView['changes']
        }
        intervalEventViews.push({ id: e.id, kind: e.kind, at: e.at, actorName: actors.get(e.actorWorkerId) ?? '?', changes })
      }
    }
  }
  return {
    workerId: input.workerId,
    workerName: wname,
    weekStart: input.weekStart,
    status: row?.status ?? 'none',
    recon,
    intervals: intervalsAudit,
    flags,
    events,
    intervalEvents: intervalEventViews,
  }
}

/* Weeks (out of the given keys) with at least one live interval for the worker.
   Used to disable Submit on empty weeks (#12 posture); no money, no recon. */
export async function weeksWithEntries(deps: Deps, ctx: SessionContext, input: { workerId: string; weekStarts: string[] }): Promise<string[]> {
  await assertCanViewWorker(ctx, input.workerId)
  const { db, tz } = deps
  const starts = input.weekStarts.map((ws) => localDayBoundariesUtcMs(ws, tz).startMs)
  const ends = input.weekStarts.map((ws) => localDayBoundariesUtcMs(ws, tz).endMs)
  const ivs = await db
    .select({ startedAt: schema.intervals.startedAt, endedAt: schema.intervals.endedAt })
    .from(schema.intervals)
    .where(and(eq(schema.intervals.workerId, input.workerId), isNull(schema.intervals.deletedAt), lt(schema.intervals.startedAt, new Date(Math.max(...ends)))))
    .all()
  const out: string[] = []
  input.weekStarts.forEach((ws, i) => {
    const s = starts[i]!
    const e = ends[i]!
    if (ivs.some((iv) => iv.startedAt.getTime() < e && iv.endedAt.getTime() > s)) out.push(ws)
  })
  return out
}

export async function listMyWeeks(deps: Deps, ctx: SessionContext, input: ListMyWeeksInput): Promise<MyWeek[]> {
  const { db, tz } = deps
  const weekStart = weekDatesOf(tz, input.weeks, deps.now())
  const rows = await db
    .select()
    .from(schema.approvals)
    .where(
      and(
        eq(schema.approvals.workerId, ctx.workerId),
        inArray(schema.approvals.weekStart, weekStart),
      ),
    )
    .all()
  const byKey = new Map(rows.map((r) => [r.weekStart, r]))
  return weekStart.map((ws) => {
    const r = byKey.get(ws)
    return {
      workerId: ctx.workerId,
      weekStart: ws,
      status: r?.status ?? 'none',
      rejectedReason: r?.rejectedReason ?? null,
    }
  })
}

export type TeamWeekRow = {
  weekStart: string
  status: ApprovalStatus | 'none'
  wallClockMin: number
  effortMin: number
  flagCount: number
}
export type TeamMember = { workerId: string; workerName: string; weeks: TeamWeekRow[] }

/* C3: supervisor's team dashboard — each supervisee's last N weeks with statuses,
   wall/effort and flag counts. Supervisees come from the session context (#12).
   No role guard — an empty team renders the empty state. */
export async function listTeamWeeks(
  deps: Deps,
  ctx: SessionContext,
  input: ListMyWeeksInput,
): Promise<TeamMember[]> {
  const { db, tz } = deps
  const superviseeIds = ctx.superviseeWorkerIds
  if (superviseeIds.length === 0) return []
  const names = await workerNames(db, superviseeIds)
  const cfg = flagsCfg(await getOrgSettings(deps, ctx))
  const weekStarts = weekDatesOf(tz, input.weeks, deps.now())
  const out: TeamMember[] = []
  for (const workerId of superviseeIds) {
    const weeks: TeamWeekRow[] = []
    for (const ws of weekStarts) {
      // sequential per week keeps DB handling simple at demo scale
      const row = await loadApprovalRow(db, workerId, ws)
      const intervals = await loadIntervalsForWeek(db, workerId, ws, tz)
      const pieces = toPieces(intervals, ws, tz)
      const r = piecesRecon(pieces)
      const supervisors = await workerSupervisors(db, [workerId])
      const flagInput = {
        weekStart: ws,
        tz,
        worker: { id: workerId, supervisorId: supervisors.get(workerId) ?? null },
        intervals: toIntervalsForRedFlags(intervals),
        pieces,
      }
      const flags = redFlags(flagInput, cfg)
      weeks.push({ weekStart: ws, status: row?.status ?? 'none', wallClockMin: r.wallClockMin, effortMin: r.effortMin, flagCount: flags.length })
    }
    out.push({ workerId, workerName: names.get(workerId) ?? '?', weeks })
  }
  return out
}

function weekDatesOf(tz: string, count: number, now: Date = new Date()): string[] {
  // The "current week" is the Monday containing `now`, in tz. `now` is injected
  // so the Deps clock-injection pattern is honoured and tests can use a fixed
  // clock. (#L8)
  const localIso = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const monday = mondayOf(localIso)
  return Array.from({ length: count }, (_, i) => addDays(monday, -7 * (count - 1 - i)))
}

function mondayOf(iso: string): string {
  // iso is YYYY-MM-DD in tz; convert to UTC ms at local midnight, then back to ISO via the
  // org tz to be safe. For our purposes (Perth, no DST), a simple date-math works.
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  const dow = date.getUTCDay() // 0=Sun
  date.setUTCDate(date.getUTCDate() - (dow === 0 ? 6 : dow - 1))
  return date.toISOString().slice(0, 10)
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}
