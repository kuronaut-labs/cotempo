// Leave requests: submitted → approved | rejected; submitted → cancelled by
// owner/admin. Decided rows are immutable (audit lives in leave_events).
// Balances are computed, never stored: policy + hire date + worked minutes −
// approved usage. Leave never blocks time entries (parallel model).

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { localDateOf, localDayBoundariesUtcMs } from '~/lib/dayMath'
import { HttpError } from '~/lib/errors'
import {
  accrualYears,
  computeAvailableMinutes,
  requestMinutes,
  type LeavePolicy,
} from '~/lib/leaveMath'
import type { LeaveTypeInput } from '~/lib/schemas/leave'
import { hasRole, type SessionContext } from '~/server/context'
import { schema } from '~/server/db'
import type { Deps } from './deps'

const { leaveTypes, leaveRequests, workers, intervals } = schema

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

// shared view builder — B2 extends this file with the lifecycle functions
async function requestViewsFor(deps: Deps, workerId: string): Promise<LeaveRequestView[]> {
  const rows = await deps.db
    .select()
    .from(leaveRequests)
    .where(eq(leaveRequests.workerId, workerId))
    .orderBy(desc(leaveRequests.submittedAt))
  return rows.map((r) => ({ ...toViewShell(r), workerName: '', typeName: '' }))
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
