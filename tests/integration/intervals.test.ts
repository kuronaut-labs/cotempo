import { beforeEach, describe, expect, it } from 'vitest'
import { and, asc, eq, sql } from 'drizzle-orm'
import { asUser, at, db, deps, iso, resetDb, setWeekStatus } from './helpers'
import { ids } from '~/server/fixtures/demo'
import { updateOrgSettings } from '~/server/services/settings'
import {
  createInterval,
  deleteInterval,
  listDay,
  listIntervals,
  updateInterval,
} from '~/server/services/intervals'
import * as schema from '../../drizzle/schema'

beforeEach(async () => {
  await resetDb()
  await db.delete(schema.orgSettings)
})

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
    expect(a.rateCents).toBe(12_000) // position (Senior developer) overrides j1's 14_000
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

describe('position rate override', () => {
  // inline $0-billable job (demo seed has none; A1 assigns opWorker → Senior developer 12_000)
  const zeroJob = {
    id: 'test-job-zero-rate',
    projectId: ids.p1,
    name: 'Zero rate',
    billableRateCents: 0,
    createdAt: new Date(),
  }

  beforeEach(async () => {
    await db.insert(schema.jobs).values(zeroJob).onConflictDoNothing()
  })

  it('new entries snapshot the position rate over the job rate', async () => {
    const row = await createInterval(deps(), op, baseInput)
    expect(row.rateCents).toBe(12_000)
  })

  it('non-billable job stays null even with a position', async () => {
    const row = await createInterval(deps(), op, {
      ...baseInput,
      jobId: ids.j4,
    })
    expect(row.rateCents).toBeNull()
  })

  it('worker with no position gets the job rate', async () => {
    const row = await createInterval(deps(), asUser('billing'), {
      ...baseInput,
      workerId: ids.billingWorker,
    })
    expect(row.rateCents).toBe(14_000)
  })

  it('$0-billable job + position → position rate', async () => {
    const row = await createInterval(deps(), op, {
      ...baseInput,
      jobId: zeroJob.id,
    })
    expect(row.rateCents).toBe(12_000)
  })

  it('changing the job re-snapshots with the current position', async () => {
    const created = await createInterval(deps(), op, baseInput)
    const moved = await updateInterval(deps(), op, {
      id: created.id,
      jobId: zeroJob.id,
    })
    expect(moved.rateCents).toBe(12_000)
  })
})

describe('updateInterval (#18, #26)', () => {
  it('increments edit_count; job change re-snapshots rate; time-only edit keeps it', async () => {
    const a = await createInterval(deps(), op, baseInput)
    await updateInterval(deps(), op, { id: a.id, note: 'x' })
    expect((await updateInterval(deps(), op, { id: a.id, note: 'y' })).note).toBe('y')
    let row = await db.select().from(schema.intervals).where(eq(schema.intervals.id, a.id)).get()
    expect(row?.editCount).toBe(2)
    expect(row?.rateCents).toBe(12_000) // snapshot from creation; position was 12_000

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

describe('listIntervals from/to (#19, #22)', () => {
  it('bounds the range by org-zone days, not UTC days', async () => {
    // 06:00 Perth on Sep 3 is 22:00Z on Sep 2: a UTC-day filter would misfile it under `to: '2026-09-02'`.
    const early = await createInterval(deps(), op, {
      ...baseInput,
      startedAt: '2026-09-02T22:00:00.000Z',
      endedAt: '2026-09-02T23:00:00.000Z',
    })
    const upTo2 = await listIntervals(deps(), op, { workerId: ids.opWorker, from: '2026-09-02', to: '2026-09-02', limit: 50 })
    expect(upTo2.rows.map((r) => r.id)).not.toContain(early.id)
    const day3 = await listIntervals(deps(), op, { workerId: ids.opWorker, from: '2026-09-03', to: '2026-09-03', limit: 50 })
    expect(day3.rows.map((r) => r.id)).toContain(early.id)
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

describe('interval events', () => {
  const events = async (intervalId: string) =>
    db
      .select()
      .from(schema.intervalEvents)
      .where(eq(schema.intervalEvents.intervalId, intervalId))
      .orderBy(asc(schema.intervalEvents.at), sql`rowid`)
      .all()

  it('create emits a create event', async () => {
    const iv = await createInterval(deps(), asUser('billing'), {
      workerId: ids.billingWorker, jobId: ids.j1,
      startedAt: at(1, 9).toISOString(), endedAt: at(1, 11).toISOString(),
    })
    const evs = await events(iv.id)
    expect(evs.map((e) => e.kind)).toEqual(['create'])
    expect(evs[0]!.actorWorkerId).toBe(ids.billingWorker)
    expect(evs[0]!.changes).toBeNull()
  })

  it('note edit emits an edit event with the note diff', async () => {
    const iv = await createInterval(deps(), asUser('billing'), {
      workerId: ids.billingWorker, jobId: ids.j1,
      startedAt: at(1, 9).toISOString(), endedAt: at(1, 11).toISOString(),
    })
    await updateInterval(deps(), asUser('billing'), { id: iv.id, note: 'focus' })
    const evs = await events(iv.id)
    expect(evs.map((e) => e.kind)).toEqual(['create', 'edit'])
    const changes = JSON.parse(evs[1]!.changes!) as { note: { from: unknown; to: unknown } }
    expect(changes.note).toEqual({ from: null, to: 'focus' })
  })

  it('job change records jobId and rateCents diffs', async () => {
    const iv = await createInterval(deps(), asUser('billing'), {
      workerId: ids.billingWorker, jobId: ids.j1,
      startedAt: at(1, 9).toISOString(), endedAt: at(1, 11).toISOString(),
    })
    await updateInterval(deps(), asUser('billing'), { id: iv.id, jobId: ids.j3 })
    const changes = JSON.parse((await events(iv.id))[1]!.changes!) as Record<string, { from: unknown; to: unknown }>
    expect(changes.jobId).toEqual({ from: ids.j1, to: ids.j3 })
    expect(changes.rateCents).toEqual({ from: 14000, to: 12000 }) // billingWorker has no position; j1 $140 → j3 $120
  })

  it('delete emits a delete event', async () => {
    const iv = await createInterval(deps(), asUser('billing'), {
      workerId: ids.billingWorker, jobId: ids.j1,
      startedAt: at(1, 9).toISOString(), endedAt: at(1, 11).toISOString(),
    })
    await deleteInterval(deps(), asUser('billing'), { id: iv.id })
    const evs = await events(iv.id)
    expect(evs.map((e) => e.kind)).toEqual(['create', 'delete'])
  })
})

describe('requireAssignment (#7 exception, default off)', () => {
  const onJ3 = {
    workerId: ids.opWorker,
    jobId: ids.j3,
    startedAt: iso(at(4, 9, 0)),
    endedAt: iso(at(4, 10, 0)),
  }
  const flip = (on: boolean) => updateOrgSettings(deps(), asUser('admin'), { requireAssignment: on })

  it('accepts unassigned time while the setting is off (default)', async () => {
    const iv = await createInterval(deps(), op, onJ3)
    expect(iv.jobId).toBe(ids.j3)
  })

  it('refuses unassigned time, accepts assigned jobs (j2), admins exempt (#7)', async () => {
    await flip(true)
    await expect(createInterval(deps(), op, onJ3)).rejects.toMatchObject({ status: 403, code: 'NOT_ASSIGNED', field: 'jobId' })
    const j2 = await createInterval(deps(), op, { ...onJ3, jobId: ids.j2 })
    expect(j2.jobId).toBe(ids.j2)
    const admin = await createInterval(deps(), asUser('admin'), onJ3)
    expect(admin.jobId).toBe(ids.j3)
  })

  it('judges the target worker, not the author (operator logging for supervised agent)', async () => {
    await flip(true)
    await expect(
      createInterval(deps(), op, { ...onJ3, workerId: ids.agent1 }),
    ).rejects.toMatchObject({ status: 403, code: 'NOT_ASSIGNED', field: 'jobId' })
    const ok = await createInterval(deps(), op, { workerId: ids.agent1, jobId: ids.j1, startedAt: iso(at(4, 11, 0)), endedAt: iso(at(4, 12, 0)) })
    expect(ok.workerId).toBe(ids.agent1)
  })

  it('checks update only when the job changes', async () => {
    await flip(true)
    const iv = await createInterval(deps(), op, { workerId: ids.opWorker, jobId: ids.j2, startedAt: iso(at(4, 13, 0)), endedAt: iso(at(4, 14, 0)) })
    await expect(updateInterval(deps(), op, { id: iv.id, jobId: ids.j3 })).rejects.toMatchObject({ status: 403, code: 'NOT_ASSIGNED' })
    const moved = await updateInterval(deps(), op, { id: iv.id, startedAt: iso(at(4, 15, 0)), endedAt: iso(at(4, 16, 0)) })
    expect(moved.startedAt.getTime()).toBe(at(4, 15, 0).getTime())
  })
})
