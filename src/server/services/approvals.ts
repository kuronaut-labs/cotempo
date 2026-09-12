import { and, eq, gt, inArray, isNull, lt } from 'drizzle-orm'
import { explode, recon as piecesRecon, type Piece } from '~/lib/attribution'
import { localDayBoundariesUtcMs } from '~/lib/dayMath'
import { HttpError } from '~/lib/errors'
import { redFlags, type Flag } from '~/lib/redFlags'
import { isMonday } from '~/lib/week'
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

function toPieces(rows: Awaited<ReturnType<typeof loadIntervalsForWeek>>, tz: string): Piece[] {
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
    for (const p of pieces) all.push(p)
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
  await db
    .update(schema.approvals)
    .set({
      status: 'approved',
      approvedAt: now,
      approvedBy: ctx.workerId,
      approvedComment: input.comment ?? null,
      updatedAt: now,
    })
    .where(eq(schema.approvals.id, existing.id))
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
  await db
    .update(schema.approvals)
    .set({
      status: 'rejected',
      rejectedAt: now,
      rejectedBy: ctx.workerId,
      rejectedReason: input.reason,
      updatedAt: now,
    })
    .where(eq(schema.approvals.id, existing.id))
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
  const keepCents = canSeeMoney(ctx)
  const out: PendingWeek[] = []
  for (const r of rows) {
    const intervals = await loadIntervalsForWeek(db, r.workerId, r.weekStart, tz)
    const pieces = toPieces(intervals, tz)
    const flagInput = {
      weekStart: r.weekStart,
      tz,
      worker: { id: r.workerId, supervisorId: null },
      intervals: toIntervalsForRedFlags(intervals),
      pieces,
    }
    const flags = redFlags(flagInput)
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
  const pieces = toPieces(intervals, tz)
  const keepCents = canSeeMoney(ctx)
  const r = piecesRecon(pieces)
  const recon = makeReconLiteral(r, keepCents)
  const intervalsAudit: WeekIntervalAudit[] = []
  if (intervals.length > 0) {
    const creatorIds = [...new Set(intervals.map((i) => i.createdBy))]
    const creators = await workerNames(db, creatorIds)
    for (const i of intervals) {
      intervalsAudit.push({
        id: i.id,
        jobName: i.jobName,
        clientName: i.clientName,
        startedAt: i.startedAt,
        endedAt: i.endedAt,
        minutes: Math.max(0, Math.round((i.endedAt.getTime() - i.startedAt.getTime()) / 60_000)),
        createdByName: creators.get(i.createdBy) ?? '?',
        createdAt: i.createdAt,
        editCount: i.editCount,
      })
    }
  }
  const flags = redFlags({
    weekStart: input.weekStart,
    tz,
    worker: { id: input.workerId, supervisorId: null },
    intervals: toIntervalsForRedFlags(intervals),
    pieces,
  })
  const events: (ApprovalEventRow & { actorName: string })[] = []
  if (row) {
    const raw = await loadEvents(db, row.id)
    if (raw.length > 0) {
      const actors = await workerNames(db, raw.map((e) => e.actorWorkerId))
      for (const e of raw) events.push({ ...e, actorName: actors.get(e.actorWorkerId) ?? '?' })
    }
  }
  const wname = (await workerNames(db, [input.workerId])).get(input.workerId) ?? '?'
  return {
    workerId: input.workerId,
    workerName: wname,
    weekStart: input.weekStart,
    status: row?.status ?? 'none',
    recon,
    intervals: intervalsAudit,
    flags,
    events,
  }
}

export async function listMyWeeks(deps: Deps, ctx: SessionContext, input: ListMyWeeksInput): Promise<MyWeek[]> {
  const { db, tz } = deps
  const weekStart = weekDatesOf(tz, input.weeks)
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

function weekDatesOf(tz: string, count: number): string[] {
  // The "current week" is the Monday containing the server's now, in tz.
  const today = new Date()
  const localIso = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(today)
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
