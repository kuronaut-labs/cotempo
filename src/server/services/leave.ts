// Leave requests: submitted → approved | rejected; submitted → cancelled by
// owner/admin. Decided rows are immutable (audit lives in leave_events).
// Balances are computed, never stored: policy + hire date + worked minutes −
// approved usage. Leave never blocks time entries (parallel model).

import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import { localDateOf, localDayBoundariesUtcMs } from '~/lib/dayMath'
import { HttpError } from '~/lib/errors'
import {
  accrualYears,
  computeAvailableMinutes,
  requestMinutes,
  type LeavePolicy,
} from '~/lib/leaveMath'
import {
  ApproveLeaveInput,
  CancelLeaveInput,
  LeaveRequestInput,
  RejectLeaveInput,
} from '~/lib/schemas/leave'
import type { LeaveTypeInput } from '~/lib/schemas/leave'
import { hasRole, type SessionContext } from '~/server/context'
import { schema } from '~/server/db'
import { assertCanEditWorker } from '~/server/guards/worker'
import type { Deps } from './deps'

const { leaveTypes, leaveRequests, leaveEvents, workers, intervals, humanWorkers, user } = schema

export type LeaveTypeView = {
  id: string
  key: string
  name: string
  paid: boolean
  accrualMethod: 'annual_allotment' | 'monthly_prorata' | 'per_hours_worked'
  minutesPerYear: number
  accrualRatePer10k: number
  maxCarryOverMinutes: number
  yearBasis: 'calendar' | 'anniversary'
}

export type LeaveBalanceView = {
  type: LeaveTypeView
  availableMinutes: number
  pendingMinutes: number
  usedMinutesThisYear: number
}

export type LeaveRequestView = {
  id: string
  workerId: string
  workerName: string
  typeId: string
  typeName: string
  startDay: string
  endDay: string
  minutesPerDay: number
  minutes: number
  status: 'submitted' | 'approved' | 'rejected' | 'cancelled'
  reason: string | null
  submittedAt: Date
  decidedAt: Date | null
  decidedBy: string | null
  decisionReason: string | null
}

const asView = (t: typeof leaveTypes.$inferSelect): LeaveTypeView => ({
  id: t.id,
  key: t.key,
  name: t.name,
  paid: t.paid,
  accrualMethod: t.accrualMethod as LeaveTypeView['accrualMethod'],
  minutesPerYear: t.minutesPerYear,
  accrualRatePer10k: t.accrualRatePer10k,
  maxCarryOverMinutes: t.maxCarryOverMinutes,
  yearBasis: t.yearBasis as LeaveTypeView['yearBasis'],
})

const policyOf = (t: LeaveTypeView): LeavePolicy => ({
  key: t.key,
  accrualMethod: t.accrualMethod,
  minutesPerYear: t.minutesPerYear,
  accrualRatePer10k: t.accrualRatePer10k,
  maxCarryOverMinutes: t.maxCarryOverMinutes,
  yearBasis: t.yearBasis,
})

export async function listLeaveTypes(
  deps: Deps,
  _ctx: SessionContext,
  includeArchived = false,
): Promise<LeaveTypeView[]> {
  const rows = await deps.db
    .select()
    .from(leaveTypes)
    .where(includeArchived ? undefined : isNull(leaveTypes.archivedAt))
    .orderBy(leaveTypes.key)
  return rows.map(asView)
}

export async function upsertLeaveType(
  deps: Deps,
  ctx: SessionContext,
  input: LeaveTypeInput,
): Promise<LeaveTypeView> {
  if (!hasRole(ctx, 'admin')) throw new HttpError(403, 'FORBIDDEN')
  const now = deps.now()
  const values = {
    id: input.id ?? crypto.randomUUID(),
    key: input.key,
    name: input.name,
    paid: input.paid,
    accrualMethod: input.accrualMethod,
    minutesPerYear: input.minutesPerYear,
    accrualRatePer10k: input.accrualRatePer10k,
    maxCarryOverMinutes: input.maxCarryOverMinutes,
    yearBasis: input.yearBasis,
    createdAt: now,
    updatedAt: now,
  }
  const [row] = await deps.db
    .insert(leaveTypes)
    .values(values)
    .onConflictDoUpdate({ target: leaveTypes.key, set: { ...values, id: sql`${leaveTypes.id}` } }) // keep the existing id on update
    .returning()
  return asView(row!)
}

// ---- balances -----------------------------------------------------------

// asOfDay lets leaveReport snapshot balances at a period end instead of now.
async function leaveBalancesFor(
  deps: Deps,
  ctx: SessionContext,
  workerId: string,
  asOfDay = localDateOf(deps.now().getTime(), deps.tz),
): Promise<LeaveBalanceView[]> {
  const types = await listLeaveTypes(deps, ctx)
  const [worker] = await deps.db.select().from(workers).where(eq(workers.id, workerId)).limit(1)
  if (!worker) throw new HttpError(404, 'NOT_FOUND', 'workerId')
  const hireDay = localDateOf(worker.createdAt.getTime(), deps.tz)

  const requests = await deps.db
    .select()
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.workerId, workerId),
        inArray(leaveRequests.status, ['submitted', 'approved']),
      ),
    )

  const balances: LeaveBalanceView[] = []
  for (const t of types) {
    const policy = policyOf(t)
    // bucket approved usage + pending per accrual year (by startDay)
    const years = accrualYears(policy, hireDay, asOfDay)
    const usedByYear = years.map(() => 0)
    let pendingMinutes = 0
    let usedMinutesThisYear = 0
    for (const r of requests) {
      if (r.typeId !== t.id) continue
      const mins = requestMinutes(r.startDay, r.endDay, r.minutesPerDay)
      if (r.status === 'submitted') {
        pendingMinutes += mins
        continue
      }
      const i = years.findIndex(
        (y, j) => r.startDay >= y.startDay && (j === years.length - 1 || r.startDay < years[j + 1]!.startDay),
      )
      if (i >= 0) usedByYear[i]! += mins
    }

    // worked minutes per year, only when the policy needs them
    const workedByYear = years.map(() => 0)
    if (policy.accrualMethod === 'per_hours_worked' && years.length > 0) {
      const rows = await deps.db
        .select({ startedAt: intervals.startedAt, endedAt: intervals.endedAt })
        .from(intervals)
        .where(and(eq(intervals.workerId, workerId), isNull(intervals.deletedAt)))
      for (const row of rows) {
        years.forEach((y, i) => {
          const ws = localDayBoundariesUtcMs(y.startDay, deps.tz).startMs
          const we = localDayBoundariesUtcMs(y.startDay, deps.tz).endMs
          const nextStart =
            i === years.length - 1
              ? Number.MAX_SAFE_INTEGER
              : localDayBoundariesUtcMs(years[i + 1]!.startDay, deps.tz).startMs
          const lo = Math.max(row.startedAt.getTime(), ws)
          const hi = Math.min(row.endedAt.getTime(), we, nextStart)
          if (hi > lo) workedByYear[i]! += Math.round((hi - lo) / 60_000)
        })
      }
    }

    if (years.length > 0) {
      usedMinutesThisYear = usedByYear[years.length - 1]!
    }
    const available =
      years.length === 0 ? 0 : computeAvailableMinutes(policy, hireDay, asOfDay, usedByYear, workedByYear)
    balances.push({ type: t, availableMinutes: available, pendingMinutes, usedMinutesThisYear })
  }
  return balances
}

export async function myLeave(
  deps: Deps,
  ctx: SessionContext,
): Promise<{ balances: LeaveBalanceView[]; requests: LeaveRequestView[] }> {
  if (!ctx.workerId) throw new HttpError(403, 'FORBIDDEN')
  const balances = await leaveBalancesFor(deps, ctx, ctx.workerId)
  const requests = await requestViewsFor(deps, ctx.workerId)
  return { balances, requests }
}

// ---- lifecycle ----------------------------------------------------------

const leaveEventRow = (
  requestId: string,
  kind: 'submit' | 'approve' | 'reject' | 'cancel',
  actorWorkerId: string,
  reason: string | null,
  at: Date,
) => ({
  id: crypto.randomUUID(),
  requestId,
  kind,
  actorWorkerId,
  reason,
  at,
})

// mirrors approvals.ts workerNames(): humanWorkers -> user name, else worker name
export async function workerDisplayName(deps: Deps, workerId: string): Promise<string> {
  const [row] = await deps.db
    .select({ userName: user.name, workerName: workers.name })
    .from(workers)
    .leftJoin(humanWorkers, eq(humanWorkers.workerId, workers.id))
    .leftJoin(user, eq(user.id, humanWorkers.userId))
    .where(eq(workers.id, workerId))
    .limit(1)
  return row?.userName ?? row?.workerName ?? '?'
}

async function requestViewById(deps: Deps, id: string): Promise<LeaveRequestView | null> {
  const [r] = await deps.db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1)
  if (!r) return null
  const [t] = await deps.db
    .select({ name: leaveTypes.name })
    .from(leaveTypes)
    .where(eq(leaveTypes.id, r.typeId))
    .limit(1)
  return { ...toViewShell(r), typeName: t?.name ?? '?', workerName: await workerDisplayName(deps, r.workerId) }
}

export async function submitLeaveRequest(
  deps: Deps,
  ctx: SessionContext,
  input: LeaveRequestInput,
): Promise<LeaveRequestView> {
  const workerId = input.workerId ?? ctx.workerId
  if (!workerId) throw new HttpError(403, 'FORBIDDEN')
  await assertCanEditWorker(ctx, workerId)
  const [type] = await deps.db
    .select()
    .from(leaveTypes)
    .where(and(eq(leaveTypes.id, input.typeId), isNull(leaveTypes.archivedAt)))
    .limit(1)
  if (!type) throw new HttpError(404, 'LEAVE_TYPE_NOT_FOUND', 'typeId')
  // zod refines this; the service re-checks for direct callers (#25, like NOT_A_MONDAY)
  if (input.endDay < input.startDay) throw new HttpError(400, 'END_BEFORE_START', 'endDay')

  // inclusive-day overlap against this worker's submitted/approved leave, any type
  const own = await deps.db
    .select({ id: leaveRequests.id, startDay: leaveRequests.startDay, endDay: leaveRequests.endDay })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.workerId, workerId),
        inArray(leaveRequests.status, ['submitted', 'approved']),
      ),
    )
  const conflict = own.find((r) => !(r.endDay < input.startDay || r.startDay > input.endDay))
  if (conflict) throw new HttpError(409, 'LEAVE_OVERLAP', 'endDay', { conflictingId: conflict.id })

  // balance gate only when the policy actually grants something
  const minutes = requestMinutes(input.startDay, input.endDay, input.minutesPerDay)
  if (type.minutesPerYear > 0 || type.accrualRatePer10k > 0) {
    const balances = await leaveBalancesFor(deps, ctx, workerId)
    const b = balances.find((x) => x.type.id === type.id)
    const available = b?.availableMinutes ?? 0
    if (available - (b?.pendingMinutes ?? 0) - minutes < 0) {
      throw new HttpError(409, 'LEAVE_INSUFFICIENT_BALANCE', 'typeId', { availableMinutes: available })
    }
  }

  const now = deps.now()
  const id = crypto.randomUUID()
  await deps.db.insert(leaveRequests).values({
    id,
    workerId,
    typeId: type.id,
    startDay: input.startDay,
    endDay: input.endDay,
    minutesPerDay: input.minutesPerDay,
    status: 'submitted',
    reason: input.reason ?? null,
    submittedAt: now,
    submittedBy: ctx.workerId!,
  })
  await deps.db.insert(leaveEvents).values(leaveEventRow(id, 'submit', ctx.workerId!, input.reason ?? null, now))
  return (await requestViewById(deps, id))!
}

export async function cancelLeaveRequest(
  deps: Deps,
  ctx: SessionContext,
  input: CancelLeaveInput,
): Promise<LeaveRequestView> {
  const [r] = await deps.db.select().from(leaveRequests).where(eq(leaveRequests.id, input.id)).limit(1)
  if (!r) throw new HttpError(404, 'LEAVE_NOT_FOUND', 'id')
  // cancel is owner-or-admin — narrower than assertCanEditWorker (no supervisor cancel)
  if (r.workerId !== ctx.workerId && !hasRole(ctx, 'admin')) throw new HttpError(403, 'FORBIDDEN_TARGET', 'workerId')
  const now = deps.now()
  const rows = await deps.db
    .update(leaveRequests)
    .set({ status: 'cancelled', decidedAt: now, decidedBy: ctx.workerId! })
    .where(and(eq(leaveRequests.id, input.id), eq(leaveRequests.status, 'submitted')))
    .returning({ id: leaveRequests.id })
  if (rows.length === 0) throw new HttpError(409, 'INVALID_TRANSITION') // approvals-style optimistic guard
  await deps.db.insert(leaveEvents).values(leaveEventRow(input.id, 'cancel', ctx.workerId!, null, now))
  return (await requestViewById(deps, input.id))!
}

const assertModerator = (ctx: SessionContext) => {
  if (!hasRole(ctx, 'billing') && !hasRole(ctx, 'admin')) throw new HttpError(403, 'FORBIDDEN')
}

const assertNotOwnRequest = (ctx: SessionContext, workerId: string) => {
  if (ctx.workerId === workerId && !hasRole(ctx, 'admin')) throw new HttpError(409, 'SELF_APPROVAL')
}

export async function approveLeaveRequest(
  deps: Deps,
  ctx: SessionContext,
  input: ApproveLeaveInput,
): Promise<LeaveRequestView> {
  assertModerator(ctx)
  const [r] = await deps.db.select().from(leaveRequests).where(eq(leaveRequests.id, input.id)).limit(1)
  if (!r) throw new HttpError(404, 'LEAVE_NOT_FOUND', 'id')
  assertNotOwnRequest(ctx, r.workerId)
  // re-check the balance at decision time — other requests may have been approved since submit
  const [type] = await deps.db.select().from(leaveTypes).where(eq(leaveTypes.id, r.typeId)).limit(1)
  const minutes = requestMinutes(r.startDay, r.endDay, r.minutesPerDay)
  if (type && (type.minutesPerYear > 0 || type.accrualRatePer10k > 0)) {
    const balances = await leaveBalancesFor(deps, ctx, r.workerId)
    const b = balances.find((x) => x.type.id === r.typeId)
    if ((b?.availableMinutes ?? 0) - minutes < 0) {
      throw new HttpError(409, 'LEAVE_INSUFFICIENT_BALANCE', 'typeId', { availableMinutes: b?.availableMinutes ?? 0 })
    }
  }
  const now = deps.now()
  const rows = await deps.db
    .update(leaveRequests)
    .set({ status: 'approved', decidedAt: now, decidedBy: ctx.workerId!, decisionReason: input.comment ?? null })
    .where(and(eq(leaveRequests.id, input.id), eq(leaveRequests.status, 'submitted')))
    .returning({ id: leaveRequests.id })
  if (rows.length === 0) throw new HttpError(409, 'INVALID_TRANSITION')
  await deps.db.insert(leaveEvents).values(leaveEventRow(input.id, 'approve', ctx.workerId!, input.comment ?? null, now))
  return (await requestViewById(deps, input.id))!
}

export async function rejectLeaveRequest(
  deps: Deps,
  ctx: SessionContext,
  input: RejectLeaveInput,
): Promise<LeaveRequestView> {
  assertModerator(ctx)
  const [r] = await deps.db.select().from(leaveRequests).where(eq(leaveRequests.id, input.id)).limit(1)
  if (!r) throw new HttpError(404, 'LEAVE_NOT_FOUND', 'id')
  assertNotOwnRequest(ctx, r.workerId)
  const now = deps.now()
  const rows = await deps.db
    .update(leaveRequests)
    .set({ status: 'rejected', decidedAt: now, decidedBy: ctx.workerId!, decisionReason: input.reason })
    .where(and(eq(leaveRequests.id, input.id), eq(leaveRequests.status, 'submitted')))
    .returning({ id: leaveRequests.id })
  if (rows.length === 0) throw new HttpError(409, 'INVALID_TRANSITION')
  await deps.db.insert(leaveEvents).values(leaveEventRow(input.id, 'reject', ctx.workerId!, input.reason, now))
  return (await requestViewById(deps, input.id))!
}

export async function leaveQueue(deps: Deps, ctx: SessionContext): Promise<LeaveRequestView[]> {
  assertModerator(ctx)
  const rows = await deps.db
    .select()
    .from(leaveRequests)
    .where(eq(leaveRequests.status, 'submitted'))
    .orderBy(asc(leaveRequests.submittedAt))
  const views: LeaveRequestView[] = []
  for (const r of rows) views.push((await requestViewById(deps, r.id))!)
  return views
}

export type LeaveReportView = {
  workerId: string
  workerName: string
  typeId: string
  typeName: string
  takenMinutes: number
  requests: number
  pendingMinutes: number
  balanceMinutes: number
}

export async function leaveReport(
  deps: Deps,
  ctx: SessionContext,
  input: { from: string; to: string },
): Promise<LeaveReportView[]> {
  assertModerator(ctx)
  const all = await deps.db
    .select()
    .from(leaveRequests)
    .where(and(gte(leaveRequests.startDay, input.from), lte(leaveRequests.startDay, input.to)))
  const groups = new Map<
    string,
    {
      workerId: string
      workerName: string
      typeId: string
      typeName: string
      takenMinutes: number
      requests: number
      pendingMinutes: number
    }
  >()
  for (const r of all) {
    if (r.status !== 'approved' && r.status !== 'submitted') continue
    const key = `${r.workerId}|${r.typeId}`
    const name = await workerDisplayName(deps, r.workerId)
    const [t] = await deps.db
      .select({ name: leaveTypes.name })
      .from(leaveTypes)
      .where(eq(leaveTypes.id, r.typeId))
      .limit(1)
    const g =
      groups.get(key) ??
      {
        workerId: r.workerId,
        workerName: name,
        typeId: r.typeId,
        typeName: t?.name ?? '?',
        takenMinutes: 0,
        requests: 0,
        pendingMinutes: 0,
      }
    const mins = requestMinutes(r.startDay, r.endDay, r.minutesPerDay)
    if (r.status === 'approved') {
      g.takenMinutes += mins
      g.requests += 1
    } else {
      g.pendingMinutes += mins
    }
    groups.set(key, g)
  }
  const out: LeaveReportView[] = []
  for (const g of groups.values()) {
    // balance snapshot at the period end, not "now" — reports describe the period
    const balances = await leaveBalancesFor(deps, ctx, g.workerId, input.to)
    const b = balances.find((x) => x.type.id === g.typeId)
    out.push({ ...g, balanceMinutes: b?.availableMinutes ?? 0 })
  }
  return out
}

// shared view builder — B2 extends this file with the lifecycle functions
async function requestViewsFor(deps: Deps, workerId: string): Promise<LeaveRequestView[]> {
  const rows = await deps.db
    .select()
    .from(leaveRequests)
    .where(eq(leaveRequests.workerId, workerId))
    .orderBy(desc(leaveRequests.submittedAt))
  const views: LeaveRequestView[] = []
  for (const r of rows) views.push((await requestViewById(deps, r.id))!)
  return views
}

function toViewShell(
  r: typeof leaveRequests.$inferSelect,
): Omit<LeaveRequestView, 'workerName' | 'typeName'> {
  return {
    id: r.id,
    workerId: r.workerId,
    typeId: r.typeId,
    startDay: r.startDay,
    endDay: r.endDay,
    minutesPerDay: r.minutesPerDay,
    minutes: requestMinutes(r.startDay, r.endDay, r.minutesPerDay),
    status: r.status as LeaveRequestView['status'],
    reason: r.reason,
    submittedAt: r.submittedAt,
    decidedAt: r.decidedAt,
    decidedBy: r.decidedBy,
    decisionReason: r.decisionReason,
  }
}
