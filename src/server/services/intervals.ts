import { and, desc, eq, gt, gte, inArray, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm'
import type { z } from 'zod'
import { schema, type Db } from '~/server/db'
import { HttpError } from '~/lib/errors'
import type { SessionContext } from '~/server/context'
import { assertCanEditWorker, assertCanViewWorker } from '~/server/guards/worker'
import { assertWeeksEditable, resetSubmittedWeeks } from '~/server/guards/week'
import { weekKeysTouched } from '~/lib/week'
import { computeTrio, localDayBoundariesUtcMs, type Range, type Trio } from '~/lib/dayMath'
import { hasRole } from '~/server/context'
import type { CreateIntervalInput, DayQuery, DeleteIntervalInput, ListIntervalsInput, UpdateIntervalInput } from '~/lib/schemas/intervals'
import type { Deps } from './deps'

export type IntervalRow = typeof schema.intervals.$inferSelect

export type DayIntervalRow = {
  id: string
  workerId: string
  jobId: string
  jobName: string
  clientName: string
  startedAt: Date
  endedAt: Date
  note: string | null
  editCount: number
  createdBy: string
}

export type DayView = { day: Range; date: string; intervals: DayIntervalRow[]; trioByWorker: Record<string, Trio> }

async function liveJob(db: Db, jobId: string) {
  const job = await db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.id, jobId), isNull(schema.jobs.archivedAt)))
    .get()
  if (!job) throw new HttpError(404, 'JOB_NOT_FOUND', 'jobId')
  return job
}

async function assertNoSameJobOverlap(
  db: Db,
  workerId: string,
  jobId: string,
  range: Range,
  excludeId?: string,
): Promise<void> {
  const clash = await db
    .select({ id: schema.intervals.id })
    .from(schema.intervals)
    .where(
      and(
        eq(schema.intervals.workerId, workerId),
        eq(schema.intervals.jobId, jobId),
        isNull(schema.intervals.deletedAt),
        lt(schema.intervals.startedAt, new Date(range.endMs)),
        gt(schema.intervals.endedAt, new Date(range.startMs)),
        excludeId ? ne(schema.intervals.id, excludeId) : undefined,
      ),
    )
    .get()
  if (clash) throw new HttpError(409, 'SAME_JOB_OVERLAP', 'jobId', { conflictingId: clash.id })
}

export async function createInterval(
  deps: Deps,
  ctx: SessionContext,
  input: z.infer<typeof CreateIntervalInput>,
): Promise<IntervalRow> {
  const { db, tz } = deps
  assertCanEditWorker(ctx, input.workerId)
  const job = await liveJob(db, input.jobId)
  const range = { startMs: Date.parse(input.startedAt), endMs: Date.parse(input.endedAt) }
  await assertNoSameJobOverlap(db, input.workerId, input.jobId, range)
  const keys = weekKeysTouched(range, tz)
  await assertWeeksEditable(db, input.workerId, keys)

  const now = deps.now()
  const row: IntervalRow = {
    id: crypto.randomUUID(),
    workerId: input.workerId,
    jobId: input.jobId,
    startedAt: new Date(range.startMs),
    endedAt: new Date(range.endMs),
    rateCents: job.billableRateCents,
    note: input.note ?? null,
    createdBy: ctx.workerId,
    editCount: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await db.insert(schema.intervals).values(row)
  await resetSubmittedWeeks(db, input.workerId, keys, ctx.workerId)
  return row
}

export async function updateInterval(
  deps: Deps,
  ctx: SessionContext,
  input: z.infer<typeof UpdateIntervalInput>,
): Promise<IntervalRow> {
  const { db, tz } = deps
  const cur = await db
    .select()
    .from(schema.intervals)
    .where(and(eq(schema.intervals.id, input.id), isNull(schema.intervals.deletedAt)))
    .get()
  if (!cur) throw new HttpError(404, 'NOT_FOUND', 'id')
  assertCanEditWorker(ctx, cur.workerId)

  const before = { startMs: cur.startedAt.getTime(), endMs: cur.endedAt.getTime() }
  const after = {
    startMs: input.startedAt ? Date.parse(input.startedAt) : before.startMs,
    endMs: input.endedAt ? Date.parse(input.endedAt) : before.endMs,
  }
  if (after.endMs <= after.startMs) throw new HttpError(400, 'END_BEFORE_START', 'endedAt')

  const jobChanged = input.jobId !== undefined && input.jobId !== cur.jobId
  const job = jobChanged ? await liveJob(db, input.jobId!) : null
  const jobId = job?.id ?? cur.jobId
  await assertNoSameJobOverlap(db, cur.workerId, jobId, after, cur.id)

  const keys = [...new Set([...weekKeysTouched(before, tz), ...weekKeysTouched(after, tz)])]
  await assertWeeksEditable(db, cur.workerId, keys)

  const now = deps.now()
  await db
    .update(schema.intervals)
    .set({
      startedAt: new Date(after.startMs),
      endedAt: new Date(after.endMs),
      jobId,
      rateCents: job ? job.billableRateCents : cur.rateCents, // snapshot only moves with the job (#18)
      note: input.note === undefined ? cur.note : input.note,
      editCount: cur.editCount + 1,
      updatedAt: now,
    })
    .where(eq(schema.intervals.id, cur.id))
  await resetSubmittedWeeks(db, cur.workerId, keys, ctx.workerId)
  const updated: IntervalRow = {
    ...cur,
    startedAt: new Date(after.startMs),
    endedAt: new Date(after.endMs),
    jobId,
    rateCents: job ? job.billableRateCents : cur.rateCents,
    note: input.note === undefined ? cur.note : input.note,
    editCount: cur.editCount + 1,
    updatedAt: now,
  }
  return updated
}

export async function deleteInterval(
  deps: Deps,
  ctx: SessionContext,
  input: z.infer<typeof DeleteIntervalInput>,
): Promise<void> {
  const { db, tz } = deps
  const cur = await db
    .select()
    .from(schema.intervals)
    .where(and(eq(schema.intervals.id, input.id), isNull(schema.intervals.deletedAt)))
    .get()
  if (!cur) throw new HttpError(404, 'NOT_FOUND', 'id')
  assertCanEditWorker(ctx, cur.workerId)
  const keys = weekKeysTouched({ startMs: cur.startedAt.getTime(), endMs: cur.endedAt.getTime() }, tz)
  await assertWeeksEditable(db, cur.workerId, keys)
  const now = deps.now()
  await db
    .update(schema.intervals)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(schema.intervals.id, cur.id))
  await resetSubmittedWeeks(db, cur.workerId, keys, ctx.workerId)
}

/** Self + supervisees (or one worker), intervals intersecting the local day, clipped for the trio. Time only (#5). */
export async function listDay(deps: Deps, ctx: SessionContext, input: z.infer<typeof DayQuery>): Promise<DayView> {
  const { db, tz } = deps
  const day = localDayBoundariesUtcMs(input.date, tz)
  // Billing/admin see everyone's day — operators are restricted to self + supervisees (#7). The route's
  // per-worker lanes depend on this returning every visible worker's intervals in one round-trip.
  const workerIds = input.workerId
    ? [input.workerId]
    : hasRole(ctx, 'billing')
      ? (await db.select({ id: schema.workers.id }).from(schema.workers).where(isNull(schema.workers.archivedAt)).all()).map((w) => w.id)
      : [ctx.workerId, ...ctx.superviseeWorkerIds]
  if (workerIds.length === 0) return { day, date: input.date, intervals: [], trioByWorker: {} }
  for (const w of workerIds) assertCanViewWorker(ctx, w)

  const rows = await db
    .select({
      id: schema.intervals.id,
      workerId: schema.intervals.workerId,
      jobId: schema.intervals.jobId,
      jobName: schema.jobs.name,
      clientName: schema.clients.name,
      startedAt: schema.intervals.startedAt,
      endedAt: schema.intervals.endedAt,
      note: schema.intervals.note,
      editCount: schema.intervals.editCount,
      createdBy: schema.intervals.createdBy,
    })
    .from(schema.intervals)
    .innerJoin(schema.jobs, eq(schema.jobs.id, schema.intervals.jobId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.jobs.projectId))
    .innerJoin(schema.clients, eq(schema.clients.id, schema.projects.clientId))
    .where(
      and(
        inArray(schema.intervals.workerId, workerIds),
        isNull(schema.intervals.deletedAt),
        lt(schema.intervals.startedAt, new Date(day.endMs)),
        gt(schema.intervals.endedAt, new Date(day.startMs)),
      ),
    )
    .orderBy(schema.intervals.startedAt)
    .all()

  const clip = (r: { startedAt: Date; endedAt: Date }): Range => ({
    startMs: Math.max(r.startedAt.getTime(), day.startMs),
    endMs: Math.min(r.endedAt.getTime(), day.endMs),
  })
  const trioByWorker: Record<string, Trio> = Object.fromEntries(
    workerIds.map((w) => [
      w,
      computeTrio(
        rows
          .filter((r) => r.workerId === w)
          .map((r) => clip({ startedAt: r.startedAt, endedAt: r.endedAt })),
      ),
    ]),
  )
  return { day, date: input.date, intervals: rows, trioByWorker }
}

/** Cursor pagination, ordered startedAt desc, id desc (#10). Operators must name a worker; billing/admin may omit. */
export async function listIntervals(
  deps: Deps,
  ctx: SessionContext,
  input: z.infer<typeof ListIntervalsInput>,
): Promise<{ rows: IntervalRow[]; nextCursor: string | null }> {
  const { db, tz } = deps
  if (input.workerId) assertCanViewWorker(ctx, input.workerId)
  else if (!hasRole(ctx, 'billing')) throw new HttpError(403, 'FORBIDDEN')

  const conds: (SQL | undefined)[] = [isNull(schema.intervals.deletedAt)]
  if (input.workerId) conds.push(eq(schema.intervals.workerId, input.workerId))
  if (input.jobId) conds.push(eq(schema.intervals.jobId, input.jobId))
  // from/to are org-zone dates, inclusive (#19)
  if (input.from) conds.push(gte(schema.intervals.startedAt, new Date(localDayBoundariesUtcMs(input.from, tz).startMs)))
  if (input.to) conds.push(lt(schema.intervals.startedAt, new Date(localDayBoundariesUtcMs(input.to, tz).endMs)))
  if (input.cursor) {
    const [ms, id] = input.cursor.split(':')
    const cursorMs = Number(ms)
    if (!Number.isFinite(cursorMs) || !id) throw new HttpError(400, 'INVALID_CURSOR', 'cursor')
    conds.push(
      or(
        lt(schema.intervals.startedAt, new Date(cursorMs)),
        and(eq(schema.intervals.startedAt, new Date(cursorMs)), lt(schema.intervals.id, id)),
      ),
    )
  }

  const limit = input.limit
  const rows = await db
    .select()
    .from(schema.intervals)
    .where(and(...conds.filter(Boolean)))
    .orderBy(desc(schema.intervals.startedAt), desc(schema.intervals.id))
    .limit(limit + 1)
    .all()

  const hasMore = rows.length > limit
  const trimmed = hasMore ? rows.slice(0, limit) : rows
  const last = trimmed[trimmed.length - 1]
  const nextCursor = hasMore && last ? `${last.startedAt.getTime()}:${last.id}` : null
  return { rows: trimmed, nextCursor }
}

export type RecentJob = {
  jobId: string
  jobName: string
  projectName: string
  clientName: string
  clientId: string
  lastUsedMs: number
}

/** Jobs this worker has logged time on, ordered by most-recently-used. Powers the
   "Recent" optgroup at the top of the entry form's Job select (#P3.15). */
export async function getRecentJobs(
  deps: Deps,
  ctx: SessionContext,
  input: { workerId: string; limit?: number },
): Promise<RecentJob[]> {
  const { db } = deps
  assertCanViewWorker(ctx, input.workerId)
  const limit = input.limit ?? 5
  const rows = await db
    .select({
      jobId: schema.intervals.jobId,
      jobName: schema.jobs.name,
      projectName: schema.projects.name,
      clientId: schema.projects.clientId,
      clientName: schema.clients.name,
      lastUsedMs: sql<number>`MAX(${schema.intervals.startedAt})`,
    })
    .from(schema.intervals)
    .innerJoin(schema.jobs, eq(schema.jobs.id, schema.intervals.jobId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.jobs.projectId))
    .innerJoin(schema.clients, eq(schema.clients.id, schema.projects.clientId))
    .where(
      and(
        eq(schema.intervals.workerId, input.workerId),
        isNull(schema.intervals.deletedAt),
        isNull(schema.workers.archivedAt),
      ),
    )
    .groupBy(schema.intervals.jobId, schema.jobs.name, schema.projects.name, schema.projects.clientId, schema.clients.name)
    .orderBy(sql`MAX(${schema.intervals.startedAt}) DESC`)
    .limit(limit)
    .all()
  return rows
}
