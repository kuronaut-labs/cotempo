import { beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { asUser, at, db, deps, iso, resetDb, setWeekStatus } from './helpers'
import { ids } from '~/server/fixtures/demo'
import {
  createInterval,
  deleteInterval,
  listDay,
  updateInterval,
} from '~/server/services/intervals'
import * as schema from '../../drizzle/schema'

beforeEach(resetDb)

const op = asUser('operator')

// Day offsets from the demo anchor (Mon 2026-08-31 00:00Z). The fixture intervals
// for opWorker land on day 0–3 between 09:00–18:00 UTC, so day 4 (Sat) is the
// first slot clear of same-job, same-worker conflicts.
const baseInput = {
  workerId: ids.opWorker,
  jobId: ids.j1,
  startedAt: iso(at(4, 9, 0)),
  endedAt: iso(at(4, 10, 0)),
}

describe('createInterval (#7, #17, #18, #22, #26)', () => {
  it('snapshots rateCents from the job; null for a non-billable job (#18)', async () => {
    const a = await createInterval(deps(), op, baseInput)
    expect(a.rateCents).toBe(14000)
    const b = await createInterval(deps(), op, {
      ...baseInput,
      startedAt: iso(at(4, 11, 0)),
      endedAt: iso(at(4, 12, 0)),
      jobId: ids.j4,
    })
    expect(b.rateCents).toBeNull()
  })

  it('rejects same-job overlap on the same worker (#7)', async () => {
    await createInterval(deps(), op, baseInput)
    await expect(
      createInterval(deps(), op, {
        ...baseInput,
        startedAt: iso(at(4, 9, 30)),
        endedAt: iso(at(4, 11, 0)),
      }),
    ).rejects.toMatchObject({ code: 'SAME_JOB_OVERLAP', field: 'jobId', status: 409 })
  })

  it('allows same time on a different job (the feature) and on a different worker', async () => {
    await createInterval(deps(), op, baseInput)
    await expect(
      createInterval(deps(), op, { ...baseInput, jobId: ids.j2 }),
    ).resolves.toBeTruthy()
    await expect(
      createInterval(deps(), op, { ...baseInput, workerId: ids.agent1 }),
    ).resolves.toBeTruthy()
  })

  it('rejects when the worker is outside the actor scope (#17)', async () => {
    await expect(
      createInterval(deps(), asUser('billing'), baseInput),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_TARGET', field: 'workerId', status: 403 })
  })

  it('lets admin create for anyone', async () => {
    await expect(createInterval(deps(), asUser('admin'), baseInput)).resolves.toBeTruthy()
  })

  it('records createdBy as the actor, not the target', async () => {
    const row = await createInterval(deps(), asUser('admin'), baseInput)
    expect(row.createdBy).toBe(ids.adminWorker)
    expect(row.workerId).toBe(ids.opWorker)
  })

  it('rejects an archived job', async () => {
    await db.update(schema.jobs).set({ archivedAt: new Date() }).where(eq(schema.jobs.id, ids.j1))
    await expect(createInterval(deps(), op, baseInput)).rejects.toMatchObject({
      code: 'JOB_NOT_FOUND',
      field: 'jobId',
    })
  })
})

describe('updateInterval (#18, #26)', () => {
  it('increments edit_count; job change re-snapshots rate; time-only edit keeps it', async () => {
    const a = await createInterval(deps(), op, baseInput)
    await updateInterval(deps(), op, { id: a.id, note: 'x' })
    await updateInterval(deps(), op, { id: a.id, note: 'y' })
    let row = await db.select().from(schema.intervals).where(eq(schema.intervals.id, a.id)).get()
    expect(row?.editCount).toBe(2)
    expect(row?.rateCents).toBe(14000)

    await updateInterval(deps(), op, { id: a.id, jobId: ids.j3 })
    row = await db.select().from(schema.intervals).where(eq(schema.intervals.id, a.id)).get()
    expect(row?.rateCents).toBe(12000)

    await updateInterval(deps(), op, { id: a.id, endedAt: iso(at(4, 11, 0)) })
    row = await db.select().from(schema.intervals).where(eq(schema.intervals.id, a.id)).get()
    expect(row?.rateCents).toBe(12000)
  })

  it('rejects edit moving into an approved week', async () => {
    const a = await createInterval(deps(), op, baseInput)
    // Day 4's week is Mon 2026-09-07; setting that week approved blocks moves into it.
    await setWeekStatus(ids.opWorker, '2026-09-07', 'approved')
    await expect(
      updateInterval(deps(), op, {
        id: a.id,
        startedAt: iso(at(7, 9, 0)),
        endedAt: iso(at(7, 10, 0)),
      }),
    ).rejects.toMatchObject({ code: 'WEEK_LOCKED', status: 409 })
  })

  it('rejects edit moving out of an approved week', async () => {
    // Create in week 2026-09-14 first, then approve that week, then try to move out.
    const b = await createInterval(deps(), op, {
      ...baseInput,
      startedAt: iso(at(14, 9, 0)),
      endedAt: iso(at(14, 10, 0)),
    })
    await setWeekStatus(ids.opWorker, '2026-09-14', 'approved')
    await expect(
      updateInterval(deps(), op, {
        id: b.id,
        startedAt: iso(at(21, 9, 0)),
        endedAt: iso(at(21, 10, 0)),
      }),
    ).rejects.toMatchObject({ code: 'WEEK_LOCKED' })
  })
})

describe('deleteInterval (#24, #26)', () => {
  it('soft-deletes and blocks further edits', async () => {
    const a = await createInterval(deps(), op, baseInput)
    await deleteInterval(deps(), op, { id: a.id })
    const row = await db.select().from(schema.intervals).where(eq(schema.intervals.id, a.id)).get()
    expect(row?.deletedAt).toBeInstanceOf(Date)
    await expect(updateInterval(deps(), op, { id: a.id, note: 'z' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('rejects delete in an approved week, admin included', async () => {
    // Create on day 5 (Sat 2026-09-05, week 2026-08-31), then approve that week.
    const a = await createInterval(deps(), op, {
      ...baseInput,
      startedAt: iso(at(5, 9, 0)),
      endedAt: iso(at(5, 10, 0)),
    })
    await setWeekStatus(ids.opWorker, '2026-08-31', 'approved')
    await expect(deleteInterval(deps(), op, { id: a.id })).rejects.toMatchObject({
      code: 'WEEK_LOCKED',
      status: 409,
    })
    await expect(deleteInterval(deps(), asUser('admin'), { id: a.id })).rejects.toMatchObject({
      code: 'WEEK_LOCKED',
    })
  })
})

describe('Sunday → Monday week boundary (#26)', () => {
  it('cross-midnight create into an approved next week → WEEK_LOCKED', async () => {
    await setWeekStatus(ids.opWorker, '2026-09-07', 'approved')
    // Day 6 23:30 → day 7 00:30 crosses into the approved week.
    await expect(
      createInterval(deps(), op, {
        ...baseInput,
        startedAt: iso(at(6, 23, 30)),
        endedAt: iso(at(7, 0, 30)),
      }),
    ).rejects.toMatchObject({ code: 'WEEK_LOCKED' })
  })
})

describe('resetSubmittedWeeks on create (#26)', () => {
  it('flips a submitted week to draft and writes an edited_after_submit event', async () => {
    // Create in week 2026-09-14, then mark it submitted, then create again in that week.
    await createInterval(deps(), asUser('admin'), {
      ...baseInput,
      startedAt: iso(at(14, 9, 0)),
      endedAt: iso(at(14, 10, 0)),
    })
    await setWeekStatus(ids.opWorker, '2026-09-14', 'submitted')
    await createInterval(deps(), asUser('admin'), {
      ...baseInput,
      startedAt: iso(at(14, 11, 0)),
      endedAt: iso(at(14, 12, 0)),
    })
    const appr = await db
      .select()
      .from(schema.approvals)
      .where(eq(schema.approvals.workerId, ids.opWorker))
      .get()
    expect(appr?.status).toBe('draft')
    const ev = await db
      .select()
      .from(schema.approvalEvents)
      .where(
        and(
          eq(schema.approvalEvents.approvalId, appr!.id),
          eq(schema.approvalEvents.kind, 'edited_after_submit'),
        ),
      )
      .all()
    expect(ev).toHaveLength(1)
    expect(ev[0]?.actorWorkerId).toBe(ids.adminWorker)
  })
})

describe('listDay (#5, #13)', () => {
  it('returns the day trio for self + supervisees with no money fields', async () => {
    const view = await listDay(deps(), op, { date: '2026-09-05' }) // day 5 = Sat 2026-09-05 Perth
    const keys = Object.keys(view.trioByWorker).sort()
    expect(keys).toEqual([ids.opWorker, ids.agent1, ids.agent2].sort())
    expect(JSON.stringify(view)).not.toMatch(/cents/i)
  })

  it('rejects requests for a worker outside the actor scope', async () => {
    await expect(
      listDay(deps(), op, { date: '2026-09-05', workerId: ids.billingWorker }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_TARGET' })
  })
})
