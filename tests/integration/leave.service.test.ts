import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { asUser, anchorMs, db, deps, resetDb } from './helpers'
import { leaveEvents, leaveRequests } from '../../drizzle/schema'
import { schema } from '~/server/db'
import {
  approveLeaveRequest,
  cancelLeaveRequest,
  leaveQueue,
  leaveReport,
  listLeaveTypes,
  myLeave,
  rejectLeaveRequest,
  submitLeaveRequest,
  upsertLeaveType,
} from '~/server/services/leave'
import { HttpError } from '~/lib/errors'

const { workers, humanWorkers } = schema

const baseType = {
  key: 'annual',
  name: 'Annual leave',
  paid: true,
  accrualMethod: 'monthly_prorata' as const,
  minutesPerYear: 9_600,
  accrualRatePer10k: 0,
  maxCarryOverMinutes: 2_400,
  yearBasis: 'calendar' as const,
}

beforeEach(async () => {
  await resetDb()
  // resetDb's demo seed carries a leave request (lr-demo-1) that references
  // lt-annual; clear requests first so type counts while testing are hermetic.
  await db.delete(leaveEvents)
  await db.delete(leaveRequests)
})
afterAll(async () => {
  await resetDb()
})

describe('listLeaveTypes', () => {
  it('any authenticated worker sees live types', async () => {
    const rows = await listLeaveTypes(deps(), asUser('operator'))
    expect(rows.map((t) => t.key)).toContain('annual')
  })
})

describe('upsertLeaveType', () => {
  it('admin can upsert by key', async () => {
    const t = await upsertLeaveType(deps(), asUser('admin'), { ...baseType, name: 'Annual leave (AU)' })
    expect(t.name).toBe('Annual leave (AU)')
    const again = await listLeaveTypes(deps(), asUser('operator'))
    expect(again.filter((x) => x.key === 'annual')).toHaveLength(1) // upsert, not duplicate
  })

  it('billing and operator are forbidden', async () => {
    await expect(upsertLeaveType(deps(), asUser('billing'), baseType)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
    await expect(upsertLeaveType(deps(), asUser('operator'), baseType)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })
})

describe('myLeave', () => {
  it('returns balances for every live type and my requests', async () => {
    const mine = await myLeave(deps(), asUser('operator'))
    expect(mine.balances.map((b) => b.type.key)).toContain('annual')
    expect(mine.balances.every((b) => b.availableMinutes >= 0)).toBe(true)
    expect(mine.requests.map((r) => r.id)).toEqual([]) // lr-demo-1 removed above
  })

  it('reports my own leave requests with names resolved', async () => {
    const mine = await myLeave(deps(), asUser('operator'))
    expect(mine.requests.map((r) => r.id)).toEqual([])
  })
})

describe('leave lifecycle', () => {
  const submit = (
    ctx: ReturnType<typeof asUser>,
    typeId: string,
    startDay: string,
    endDay: string,
    extra: Partial<import('~/lib/schemas/leave').LeaveRequestInput> = {},
  ) => submitLeaveRequest(deps(), ctx, { typeId, startDay, endDay, minutesPerDay: 480, ...extra })

  it('submits two days as 960 minutes and records a submit event', async () => {
    const ctx = asUser('operator')
    const v = await submit(ctx, 'lt-sick', '2026-10-05', '2026-10-06')
    expect(v.minutes).toBe(960)
    expect(v.status).toBe('submitted')
    const events = await db.select().from(leaveEvents).where(eq(leaveEvents.requestId, v.id))
    expect(events.map((e) => e.kind)).toEqual(['submit'])
  })

  it('re-checks END_BEFORE_START at the service layer', async () => {
    await expect(submit(asUser('operator'), 'lt-sick', '2026-10-07', '2026-10-06')).rejects.toMatchObject({
      status: 400,
      code: 'END_BEFORE_START',
    })
  })

  it('rejects overlapping leave of any type with LEAVE_OVERLAP', async () => {
    await submit(asUser('operator'), 'lt-sick', '2026-10-05', '2026-10-06')
    const err = await submit(asUser('operator'), 'lt-sick', '2026-10-06', '2026-10-08').catch((e: unknown) => e)
    expect(err).toMatchObject({ status: 409, code: 'LEAVE_OVERLAP' })
    expect((err as HttpError).data).toHaveProperty('conflictingId')
  })

  it('blocks a fresh worker beyond the accrued balance (monthly prorata)', async () => {
    // A worker hired a month ago (calendar monthly_prorata) has accrued one
    // month ≈ 800min of the 9600 annual allowance — 26 days cannot fit.
    const id = 'w-fresh'
    await db.insert(workers).values({ id, kind: 'human', createdAt: new Date(anchorMs - 30 * 86_400_000) })
    await db.insert(schema.user).values({
      id: `user-${id}`,
      name: 'Fresh Hire',
      email: 'fresh@example.com',
      emailVerified: true,
      role: 'user',
      createdAt: new Date(anchorMs - 30 * 86_400_000),
      updatedAt: new Date(anchorMs - 30 * 86_400_000),
    })
    await db
      .insert(humanWorkers)
      .values({ workerId: id, userId: `user-${id}`, roles: '[]' })
    const err = await submitLeaveRequest(deps(), asUser('admin'), {
      typeId: 'lt-annual',
      workerId: id,
      startDay: '2026-10-05',
      endDay: '2026-10-30',
      minutesPerDay: 480,
    }).catch((e: unknown) => e)
    expect(err).toMatchObject({ status: 409, code: 'LEAVE_INSUFFICIENT_BALANCE', field: 'typeId' })
    expect((err as HttpError).data).toHaveProperty('availableMinutes')
  })

  it('never balance-checks unpaid leave (no accrual)', async () => {
    const v = await submit(asUser('operator'), 'lt-unpaid', '2026-10-05', '2026-10-09')
    expect(v.minutes).toBe(5 * 480)
  })

  it('404s an unknown type with LEAVE_TYPE_NOT_FOUND', async () => {
    await expect(submit(asUser('operator'), 'lt-nope', '2026-10-05', '2026-10-06')).rejects.toMatchObject({
      status: 404,
      code: 'LEAVE_TYPE_NOT_FOUND',
      field: 'typeId',
    })
  })

  it('forbids submitting for another worker (FORBIDDEN_TARGET)', async () => {
    const other = (
      await db.select().from(workers).where(eq(workers.kind, 'human'))
    ).find((w) => w.id !== 'demo-0000-operator-worker')!.id
    await expect(
      submit(asUser('operator'), 'lt-sick', '2026-10-05', '2026-10-06', { workerId: other }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN_TARGET' })
  })

  it('approves as billing, records the event, and sets decision fields', async () => {
    const v = await submit(asUser('operator'), 'lt-sick', '2026-10-05', '2026-10-06')
    const approved = await approveLeaveRequest(deps(), asUser('billing'), { id: v.id, comment: 'Enjoy' })
    expect(approved.status).toBe('approved')
    expect(approved.decisionReason).toBe('Enjoy')
    const events = await db.select().from(leaveEvents).where(eq(leaveEvents.requestId, v.id))
    expect(events.map((e) => e.kind)).toEqual(['submit', 'approve'])
  })

  it('SELF_APPROVAL when billing approves their own request; admin override works', async () => {
    const own = await submitLeaveRequest(deps(), asUser('billing'), {
      typeId: 'lt-sick',
      startDay: '2026-10-05',
      endDay: '2026-10-06',
      minutesPerDay: 480,
    })
    await expect(approveLeaveRequest(deps(), asUser('billing'), { id: own.id })).rejects.toMatchObject({
      status: 409,
      code: 'SELF_APPROVAL',
    })
    const otherAdmin = await approveLeaveRequest(deps(), asUser('admin'), { id: own.id })
    expect(otherAdmin.status).toBe('approved')
  })

  it('operators cannot moderate (FORBIDDEN)', async () => {
    const v = await submit(asUser('operator'), 'lt-sick', '2026-10-05', '2026-10-06')
    await expect(approveLeaveRequest(deps(), asUser('operator'), { id: v.id })).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    })
  })

  it('double-approve is INVALID_TRANSITION', async () => {
    const v = await submit(asUser('operator'), 'lt-sick', '2026-10-05', '2026-10-06')
    await approveLeaveRequest(deps(), asUser('billing'), { id: v.id })
    await expect(approveLeaveRequest(deps(), asUser('billing'), { id: v.id })).rejects.toMatchObject({
      status: 409,
      code: 'INVALID_TRANSITION',
    })
  })

  it('rejects with a reason', async () => {
    const v = await submit(asUser('operator'), 'lt-sick', '2026-10-05', '2026-10-06')
    const r = await rejectLeaveRequest(deps(), asUser('billing'), { id: v.id, reason: 'Not enough balance' })
    expect(r.status).toBe('rejected')
    expect(r.decisionReason).toBe('Not enough balance')
  })

  it('cancels own submitted request; cancelling after approval is INVALID_TRANSITION', async () => {
    const op = asUser('operator')
    const a = await submit(op, 'lt-sick', '2026-11-02', '2026-11-03')
    const cancelled = await cancelLeaveRequest(deps(), op, { id: a.id })
    expect(cancelled.status).toBe('cancelled')
    const b = await submit(op, 'lt-sick', '2026-11-04', '2026-11-05')
    await approveLeaveRequest(deps(), asUser('billing'), { id: b.id })
    await expect(cancelLeaveRequest(deps(), op, { id: b.id })).rejects.toMatchObject({
      status: 409,
      code: 'INVALID_TRANSITION',
    })
  })

  it('only the owner or an admin can cancel (FORBIDDEN_TARGET)', async () => {
    const v = await submit(asUser('operator'), 'lt-sick', '2026-11-02', '2026-11-03')
    await expect(cancelLeaveRequest(deps(), asUser('billing'), { id: v.id })).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN_TARGET',
    })
  })

  it('leaveQueue lists submitted oldest-first for moderators only', async () => {
    const v = await submit(asUser('operator'), 'lt-sick', '2026-10-05', '2026-10-06')
    const queue = await leaveQueue(deps(), asUser('billing'))
    expect(queue.map((r) => r.id)).toContain(v.id)
    expect(queue.every((r) => r.status === 'submitted')).toBe(true)
    await expect(leaveQueue(deps(), asUser('operator'))).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })

  it('counts pending requests in the queue and report as pending, not taken', async () => {
    const op = asUser('operator')
    await submit(op, 'lt-sick', '2026-09-14', '2026-09-15')
    await submit(op, 'lt-sick', '2026-12-14', '2026-12-15') // outside the period
    const rows = await leaveReport(deps(), asUser('billing'), { from: '2026-09-01', to: '2026-09-30' })
    const sick = rows.find((r) => r.typeId === 'lt-sick')!
    expect(sick.takenMinutes).toBe(0)
    expect(sick.pendingMinutes).toBe(2 * 480)
    expect(Number.isInteger(sick.balanceMinutes)).toBe(true)
    expect(rows).toHaveLength(1)
  })
})
