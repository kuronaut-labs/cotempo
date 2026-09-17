import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { asUser, db, deps, resetDb, setWeekStatus } from '../../integration/helpers'
import { deepHasKey, expectCode, perth } from '../_util'
import { ids } from '~/server/fixtures/demo'
import * as schema from '../../../drizzle/schema'
import { createInterval, deleteInterval, listDay, updateInterval } from '~/server/services/intervals'

// Fixture week is Perth Mon 2026-08-31 … Sun 2026-09-06. Fixture intervals live 17:00–01:00 Perth; tests use mornings.
const D = '2026-09-02'
const op = asUser('operator')
const mk = (o: Partial<Parameters<typeof createInterval>[2]> = {}) => ({
  workerId: ids.opWorker,
  jobId: ids.j1,
  startedAt: perth(D, '08:00'),
  endedAt: perth(D, '10:00'),
  ...o,
})

beforeEach(resetDb)

describe('contract #18 rate snapshot', () => {
  it('create copies the job rate; null for a non-billable job', async () => {
    const a = await createInterval(deps(), op, mk())
    expect(a.rateCents).toBe(12000)
    const b = await createInterval(deps(), op, mk({ jobId: ids.j4, startedAt: perth(D, '10:00'), endedAt: perth(D, '11:00') }))
    expect(b.rateCents).toBeNull()
  })
  it('changing the job rate later leaves existing intervals unchanged', async () => {
    const a = await createInterval(deps(), op, mk())
    await db.update(schema.jobs).set({ billableRateCents: 99999 }).where(eq(schema.jobs.id, ids.j1))
    const row = await db.select().from(schema.intervals).where(eq(schema.intervals.id, a.id)).get()
    expect(row?.rateCents).toBe(12000)
  })
  it('edit: job change re-snapshots; time-only edit keeps the old snapshot', async () => {
    const a = await createInterval(deps(), op, mk())
    await db.update(schema.jobs).set({ billableRateCents: 15000 }).where(eq(schema.jobs.id, ids.j1))
    await updateInterval(deps(), op, { id: a.id, endedAt: perth(D, '11:00') })
    expect((await db.select().from(schema.intervals).where(eq(schema.intervals.id, a.id)).get())?.rateCents).toBe(12000)
    await updateInterval(deps(), op, { id: a.id, jobId: ids.j3 })
    expect((await db.select().from(schema.intervals).where(eq(schema.intervals.id, a.id)).get())?.rateCents).toBe(12000)
  })
})

describe('contract #7 overlap', () => {
  it('same worker + same job overlapping → SAME_JOB_OVERLAP on jobId', async () => {
    await createInterval(deps(), op, mk())
    await expectCode(createInterval(deps(), op, mk({ startedAt: perth(D, '09:00'), endedAt: perth(D, '11:00') })), 'SAME_JOB_OVERLAP', { field: 'jobId', status: 409 })
  })
  it('different job same time is allowed (the feature); different worker same job is allowed', async () => {
    await createInterval(deps(), op, mk())
    await expect(createInterval(deps(), op, mk({ jobId: ids.j2 }))).resolves.toBeTruthy()
    await expect(createInterval(deps(), op, mk({ workerId: ids.agent1 }))).resolves.toBeTruthy()
  })
  it('touching intervals do not overlap; soft-deleted rows do not count', async () => {
    const a = await createInterval(deps(), op, mk())
    await expect(createInterval(deps(), op, mk({ startedAt: perth(D, '10:00'), endedAt: perth(D, '11:00') }))).resolves.toBeTruthy()
    await deleteInterval(deps(), op, { id: a.id })
    await expect(createInterval(deps(), op, mk())).resolves.toBeTruthy()
  })
  it('editing must not overlap itself but must respect others', async () => {
    const a = await createInterval(deps(), op, mk())
    await createInterval(deps(), op, mk({ startedAt: perth(D, '10:00'), endedAt: perth(D, '11:00') }))
    await expect(updateInterval(deps(), op, { id: a.id, endedAt: perth(D, '09:30') })).resolves.toBeTruthy()
    await expectCode(updateInterval(deps(), op, { id: a.id, endedAt: perth(D, '10:30') }), 'SAME_JOB_OVERLAP')
  })
})

describe('contract #17 who may enter', () => {
  it('billing cannot create for the operator; admin can; operator can for a supervisee', async () => {
    await expectCode(createInterval(deps(), asUser('billing'), mk()), 'FORBIDDEN_TARGET', { field: 'workerId', status: 403 })
    await expect(createInterval(deps(), asUser('admin'), mk())).resolves.toBeTruthy()
    await expect(createInterval(deps(), op, mk({ workerId: ids.agent1 }))).resolves.toBeTruthy()
  })
  it('created_by records the actor, not the target', async () => {
    const a = await createInterval(deps(), asUser('admin'), mk())
    expect(a.createdBy).toBe(ids.adminWorker)
    expect(a.workerId).toBe(ids.opWorker)
  })
})

describe('contract #26 week lock', () => {
  it('create/edit/delete in an approved week → WEEK_LOCKED, admin included', async () => {
    const a = await createInterval(deps(), op, mk())
    await setWeekStatus(ids.opWorker, '2026-08-31', 'approved')
    await expectCode(createInterval(deps(), op, mk({ startedAt: perth(D, '11:00'), endedAt: perth(D, '12:00') })), 'WEEK_LOCKED', { status: 409 })
    await expectCode(updateInterval(deps(), asUser('admin'), { id: a.id, endedAt: perth(D, '11:00') }), 'WEEK_LOCKED')
    await expectCode(deleteInterval(deps(), asUser('admin'), { id: a.id }), 'WEEK_LOCKED')
  })
  it('moving an interval into or out of an approved week is refused', async () => {
    const a = await createInterval(deps(), op, mk())
    await setWeekStatus(ids.opWorker, '2026-09-07', 'approved')
    await expectCode(updateInterval(deps(), op, { id: a.id, startedAt: perth('2026-09-09', '08:00'), endedAt: perth('2026-09-09', '10:00') }), 'WEEK_LOCKED')
    const b = await createInterval(deps(), op, mk({ startedAt: perth('2026-09-16', '08:00'), endedAt: perth('2026-09-16', '10:00') }))
    await setWeekStatus(ids.opWorker, '2026-09-14', 'approved')
    await expectCode(updateInterval(deps(), op, { id: b.id, startedAt: perth('2026-09-23', '08:00'), endedAt: perth('2026-09-23', '10:00') }), 'WEEK_LOCKED')
  })
  it('Sunday 23:30 → Monday 00:30 with the next week approved → WEEK_LOCKED', async () => {
    await setWeekStatus(ids.opWorker, '2026-09-07', 'approved')
    await expectCode(createInterval(deps(), op, mk({ startedAt: perth('2026-09-06', '23:30'), endedAt: perth('2026-09-07', '00:30') })), 'WEEK_LOCKED')
    await expect(createInterval(deps(), op, mk({ startedAt: perth('2026-09-06', '23:00'), endedAt: perth('2026-09-07', '00:00') }))).resolves.toBeTruthy()
  })
  it('a mutation on a submitted week flips it to draft with an edited_after_submit event', async () => {
    await setWeekStatus(ids.opWorker, '2026-08-31', 'submitted')
    await createInterval(deps(), asUser('admin'), mk())
    const appr = await db.select().from(schema.approvals).where(eq(schema.approvals.workerId, ids.opWorker)).get()
    expect(appr?.status).toBe('draft')
    const ev = await db.select().from(schema.approvalEvents).where(eq(schema.approvalEvents.approvalId, appr!.id)).all()
    expect(ev.map((e) => [e.kind, e.actorWorkerId])).toEqual([['edited_after_submit', ids.adminWorker]])
  })
  it('the lock is per worker', async () => {
    await setWeekStatus(ids.opWorker, '2026-08-31', 'approved')
    await expect(createInterval(deps(), op, mk({ workerId: ids.agent1 }))).resolves.toBeTruthy()
  })
})

describe('contract audit fields', () => {
  it('edit increments edit_count; delete is soft', async () => {
    const a = await createInterval(deps(), op, mk())
    await updateInterval(deps(), op, { id: a.id, note: 'x' })
    await updateInterval(deps(), op, { id: a.id, note: 'y' })
    expect((await db.select().from(schema.intervals).where(eq(schema.intervals.id, a.id)).get())?.editCount).toBe(2)
    await deleteInterval(deps(), op, { id: a.id })
    const row = await db.select().from(schema.intervals).where(eq(schema.intervals.id, a.id)).get()
    expect(row).toBeTruthy()
    expect(row?.deletedAt).toBeInstanceOf(Date)
    await expectCode(updateInterval(deps(), op, { id: a.id, note: 'z' }), 'NOT_FOUND')
  })
  it('archived job cannot be used', async () => {
    await db.update(schema.jobs).set({ archivedAt: new Date() }).where(eq(schema.jobs.id, ids.j1))
    await expectCode(createInterval(deps(), op, mk()), 'JOB_NOT_FOUND', { field: 'jobId' })
  })
})

describe('contract #5/#13 listDay', () => {
  it('clips a midnight-crossing interval to the day in the trio and never returns money', async () => {
    await createInterval(deps(), op, mk({ startedAt: perth('2026-09-01', '23:00'), endedAt: perth('2026-09-02', '01:00') }))
    await createInterval(deps(), op, mk({ jobId: ids.j2, startedAt: perth(D, '00:30'), endedAt: perth(D, '01:30') }))
    const view = await listDay(deps(), op, { date: D })
    expect(view.trioByWorker[ids.opWorker]).toEqual({ wallClockMin: 210, effortMin: 240, premiumMin: 30 })
    expect(deepHasKey(view, 'cents')).toBe(false)
    expect(deepHasKey(view, 'rateCents')).toBe(false)
    expect(deepHasKey(view, 'billableRateCents')).toBe(false)
  })
  it('operator sees self + supervisees, not others', async () => {
    const view = await listDay(deps(), op, { date: '2026-08-31' })
    expect(Object.keys(view.trioByWorker).sort()).toEqual([ids.opWorker, ids.agent1, ids.agent2].sort())
    await expectCode(listDay(deps(), op, { date: D, workerId: ids.billingWorker }), 'FORBIDDEN_TARGET')
  })
})
