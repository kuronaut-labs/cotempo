import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { anchorMs, asUser, db, deps as fixedDeps, resetDb } from '../../integration/helpers'
import { deepHasKey, expectCode, perth } from '../_util'

// Each call sees a later `now`, so event order is assertable by `at`.
let tick = anchorMs + 7 * 86_400_000
const deps = () => fixedDeps(new Date((tick += 60_000)))
import { ids } from '~/server/fixtures/demo'
import * as schema from '../../../drizzle/schema'
import { createInterval } from '~/server/services/intervals'
import { approveWeek, getWeekForApproval, listPendingWeeks, rejectWeek, submitWeek, unlockWeek } from '~/server/services/approvals'

const WEEK = '2026-08-31'
const target = { workerId: ids.opWorker, weekStart: WEEK }
const op = asUser('operator')
const billing = asUser('billing')
const admin = asUser('admin')

beforeEach(resetDb)

describe('contract #12/#26 state machine', () => {
  it('submit → approve → unlock → submit → reject → submit → approve, with the event log in order', async () => {
    await submitWeek(deps(), op, target)
    await approveWeek(deps(), billing, { ...target, comment: 'ok' })
    await unlockWeek(deps(), admin, { ...target, reason: 'fix' })
    await submitWeek(deps(), op, target)
    await rejectWeek(deps(), billing, { ...target, reason: 'gap' })
    await submitWeek(deps(), op, target)
    const final = await approveWeek(deps(), billing, target)
    expect(final.status).toBe('approved')
    const ev = await db.select().from(schema.approvalEvents).where(eq(schema.approvalEvents.approvalId, final.id)).orderBy(schema.approvalEvents.at).all()
    expect(ev.map((e) => e.kind)).toEqual(['submit', 'approve', 'unlock', 'submit', 'reject', 'submit', 'approve'])
    expect(ev.map((e) => e.actorWorkerId)).toEqual([ids.opWorker, ids.billingWorker, ids.adminWorker, ids.opWorker, ids.billingWorker, ids.opWorker, ids.billingWorker])
    expect(ev[2]?.reason).toBe('fix')
    expect(ev[4]?.reason).toBe('gap')
  })
  it('invalid transitions → INVALID_TRANSITION (409)', async () => {
    await expectCode(approveWeek(deps(), billing, target), 'INVALID_TRANSITION', { status: 409 }) // no row
    await submitWeek(deps(), op, target)
    await expectCode(submitWeek(deps(), op, target), 'INVALID_TRANSITION') // already submitted
    await expectCode(unlockWeek(deps(), admin, { ...target, reason: 'x' }), 'INVALID_TRANSITION') // not approved
    await approveWeek(deps(), billing, target)
    await expectCode(rejectWeek(deps(), billing, { ...target, reason: 'x' }), 'INVALID_TRANSITION') // already approved
  })
  it('weekStart must be a Monday', async () => {
    await expectCode(submitWeek(deps(), op, { workerId: ids.opWorker, weekStart: '2026-09-01' }), 'NOT_A_MONDAY', { field: 'weekStart' })
  })
})

describe('contract #5/#17 who may do what', () => {
  it('billing cannot approve or reject their own week; admin can', async () => {
    await submitWeek(deps(), billing, { workerId: ids.billingWorker, weekStart: WEEK })
    await expectCode(approveWeek(deps(), billing, { workerId: ids.billingWorker, weekStart: WEEK }), 'SELF_APPROVAL', { status: 409 })
    await expectCode(rejectWeek(deps(), billing, { workerId: ids.billingWorker, weekStart: WEEK, reason: 'x' }), 'SELF_APPROVAL')
    await submitWeek(deps(), admin, { workerId: ids.adminWorker, weekStart: WEEK })
    const a = await approveWeek(deps(), admin, { workerId: ids.adminWorker, weekStart: WEEK })
    expect(a.status).toBe('approved')
    expect(a.approvedBy).toBe(ids.adminWorker)
  })
  it('operator cannot approve, reject or unlock; billing cannot unlock', async () => {
    await submitWeek(deps(), op, target)
    await expectCode(approveWeek(deps(), op, target), 'FORBIDDEN')
    await expectCode(rejectWeek(deps(), op, { ...target, reason: 'x' }), 'FORBIDDEN')
    await approveWeek(deps(), billing, target)
    await expectCode(unlockWeek(deps(), op, { ...target, reason: 'x' }), 'FORBIDDEN')
    await expectCode(unlockWeek(deps(), billing, { ...target, reason: 'x' }), 'FORBIDDEN')
  })
  it('submit scope follows entry rights: operator for self + supervisees, admin for anyone, billing not for others', async () => {
    await expect(submitWeek(deps(), op, { workerId: ids.agent1, weekStart: WEEK })).resolves.toBeTruthy()
    await expectCode(submitWeek(deps(), op, { workerId: ids.billingWorker, weekStart: WEEK }), 'FORBIDDEN_TARGET')
    await expectCode(submitWeek(deps(), billing, target), 'FORBIDDEN_TARGET')
    await expect(submitWeek(deps(), admin, target)).resolves.toBeTruthy()
  })
})

describe('contract #26 lock round trip', () => {
  it('approved week blocks entry; unlock makes it editable again', async () => {
    const mk = { workerId: ids.opWorker, jobId: ids.j1, startedAt: perth('2026-09-02', '08:00'), endedAt: perth('2026-09-02', '09:00') }
    await submitWeek(deps(), op, target)
    await approveWeek(deps(), billing, target)
    await expectCode(createInterval(deps(), admin, mk), 'WEEK_LOCKED')
    await unlockWeek(deps(), admin, { ...target, reason: 'late entry' })
    await expect(createInterval(deps(), admin, mk)).resolves.toBeTruthy()
  })
})

describe('contract #12 approver view', () => {
  it('queue lists submitted weeks; the view carries flags, audit columns, events, and money only for billing', async () => {
    await submitWeek(deps(), op, target)
    const queue = await listPendingWeeks(deps(), billing)
    expect(queue.map((q) => [q.workerId, q.weekStart])).toEqual([[ids.opWorker, WEEK]])
    const view = await getWeekForApproval(deps(), billing, target)
    expect(view.status).toBe('submitted')
    expect(view.intervals.length).toBeGreaterThan(0)
    expect(view.intervals[0]).toMatchObject({ createdByName: expect.any(String), editCount: expect.any(Number) })
    expect(Array.isArray(view.flags)).toBe(true)
    expect(view.events.map((e) => e.kind)).toEqual(['submit'])
    expect(deepHasKey(view.recon, 'cents')).toBe(true)
    const opView = await getWeekForApproval(deps(), op, target)
    expect(deepHasKey(opView, 'cents')).toBe(false)
  })
})
