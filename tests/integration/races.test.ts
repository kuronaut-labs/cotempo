import { beforeEach, describe, expect, it } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import { asUser, at, db, deps, iso, resetDb, setWeekStatus } from './helpers'
import { ids } from '~/server/fixtures/demo'
import * as schema from '../../drizzle/schema'
import { createInterval, deleteInterval, updateInterval } from '~/server/services/intervals'
import { approveWeek, rejectWeek, submitWeek, unlockWeek } from '~/server/services/approvals'

// Two requests started together interleave at every await, so both read before either writes.
// The checks inside each write must still hold.

beforeEach(resetDb)

const op = asUser('operator')
const billing = asUser('billing')
const outcomes = (results: PromiseSettledResult<unknown>[]) =>
  results.map((r) => (r.status === 'fulfilled' ? 'ok' : (r.reason as { code?: string }).code ?? String(r.reason)))

describe('concurrent interval writes', () => {
  it('two overlapping entries on the same job: exactly one lands', async () => {
    const entry = (startH: number) =>
      createInterval(deps(), op, { workerId: ids.opWorker, jobId: ids.j2, startedAt: iso(at(4, startH)), endedAt: iso(at(4, startH + 2)) })
    const results = await Promise.allSettled([entry(9), entry(10)])
    expect(outcomes(results).sort()).toEqual(['SAME_JOB_OVERLAP', 'ok'])
    const rows = await db
      .select()
      .from(schema.intervals)
      .where(and(eq(schema.intervals.workerId, ids.opWorker), eq(schema.intervals.jobId, ids.j2)))
      .all()
    expect(rows.filter((r) => r.startedAt.getTime() >= at(4, 0).getTime())).toHaveLength(1)
  })

  it('an edit racing an approval never changes an approved week', async () => {
    await setWeekStatus(ids.opWorker, '2026-08-31', 'submitted')
    const results = await Promise.allSettled([
      updateInterval(deps(), op, { id: 'demo-0000-iv-05', note: 'late edit' }),
      approveWeek(deps(), billing, { workerId: ids.opWorker, weekStart: '2026-08-31' }),
    ])
    const appr = await db.select().from(schema.approvals).where(eq(schema.approvals.workerId, ids.opWorker)).get()
    const iv = await db.select().from(schema.intervals).where(eq(schema.intervals.id, 'demo-0000-iv-05')).get()
    // Exactly one wins: either the edit lands and the week drops to draft, or the approval lands and the edit is refused.
    expect(outcomes(results).filter((o) => o === 'ok')).toHaveLength(1)
    if (appr!.status === 'approved') expect(iv!.note).toBeNull()
    else expect(iv!.note).toBe('late edit')
  })

  it('a delete racing an approval never removes time from an approved week', async () => {
    await setWeekStatus(ids.opWorker, '2026-08-31', 'submitted')
    const results = await Promise.allSettled([
      deleteInterval(deps(), op, { id: 'demo-0000-iv-05' }),
      approveWeek(deps(), billing, { workerId: ids.opWorker, weekStart: '2026-08-31' }),
    ])
    const appr = await db.select().from(schema.approvals).where(eq(schema.approvals.workerId, ids.opWorker)).get()
    const iv = await db.select().from(schema.intervals).where(eq(schema.intervals.id, 'demo-0000-iv-05')).get()
    expect(outcomes(results).filter((o) => o === 'ok')).toHaveLength(1)
    if (appr!.status === 'approved') expect(iv!.deletedAt).toBeNull()
    else expect(iv!.deletedAt).toBeInstanceOf(Date)
  })

  // Depends on the two edits interleaving (both read before either writes); run one after the other, both would succeed.
  it('two edits of the same entry: the second is refused instead of silently overwriting', async () => {
    const results = await Promise.allSettled([
      updateInterval(deps(), op, { id: 'demo-0000-iv-05', note: 'first' }),
      updateInterval(deps(), op, { id: 'demo-0000-iv-05', note: 'second' }),
    ])
    expect(outcomes(results).sort()).toEqual(['EDIT_CONFLICT', 'ok'])
    const iv = await db.select().from(schema.intervals).where(eq(schema.intervals.id, 'demo-0000-iv-05')).get()
    expect(iv!.editCount).toBe(1)
    const events = await db.select().from(schema.intervalEvents).where(eq(schema.intervalEvents.intervalId, 'demo-0000-iv-05')).all()
    expect(events.filter((e) => e.kind === 'edit')).toHaveLength(1)
  })
})

describe('an edit landing between a delete\'s checks and its write', () => {
  // Deterministic stand-in for the race: the db hands the delete's batch over only after another
  // request's edit has committed, i.e. after the delete read the entry but before it wrote.
  const editsBeforeNextBatch = (intervalId: string) => {
    let done = false
    return new Proxy(db, {
      get(target, prop, receiver) {
        if (prop !== 'batch' || done) return Reflect.get(target, prop, receiver)
        return async (stmts: Parameters<typeof db.batch>[0]) => {
          done = true
          await db
            .update(schema.intervals)
            .set({ note: 'edited elsewhere', editCount: sql`${schema.intervals.editCount} + 1` })
            .where(eq(schema.intervals.id, intervalId))
          return target.batch(stmts)
        }
      },
    })
  }

  it('the delete is refused rather than removing an entry the user has not seen', async () => {
    const d = { ...deps(), db: editsBeforeNextBatch('demo-0000-iv-05') }
    await expect(deleteInterval(d, op, { id: 'demo-0000-iv-05' })).rejects.toMatchObject({ code: 'EDIT_CONFLICT' })
    const iv = await db.select().from(schema.intervals).where(eq(schema.intervals.id, 'demo-0000-iv-05')).get()
    expect(iv).toMatchObject({ note: 'edited elsewhere', deletedAt: null })
  })
})

describe('concurrent approval transitions', () => {
  const week = { workerId: ids.opWorker, weekStart: '2026-08-31' }
  const eventsOf = async (kind: string) => {
    const appr = await db.select().from(schema.approvals).where(eq(schema.approvals.workerId, ids.opWorker)).get()
    const all = appr ? await db.select().from(schema.approvalEvents).where(eq(schema.approvalEvents.approvalId, appr.id)).all() : []
    return all.filter((e) => e.kind === kind)
  }

  it('a double submit records one submission', async () => {
    const results = await Promise.allSettled([submitWeek(deps(), op, week), submitWeek(deps(), op, week)])
    expect(outcomes(results).sort()).toEqual(['INVALID_TRANSITION', 'ok'])
    expect(await eventsOf('submit')).toHaveLength(1)
  })

  it('a double unlock records one unlock', async () => {
    const admin = asUser('admin')
    await setWeekStatus(ids.opWorker, '2026-08-31', 'approved')
    const results = await Promise.allSettled([
      unlockWeek(deps(), admin, { ...week, reason: 'fix' }),
      unlockWeek(deps(), admin, { ...week, reason: 'fix' }),
    ])
    expect(outcomes(results).sort()).toEqual(['INVALID_TRANSITION', 'ok'])
    expect(await eventsOf('unlock')).toHaveLength(1)
  })

  it('approve and reject together: one wins and only its event is recorded', async () => {
    await setWeekStatus(ids.opWorker, '2026-08-31', 'submitted')
    const results = await Promise.allSettled([
      approveWeek(deps(), billing, week),
      rejectWeek(deps(), billing, { ...week, reason: 'no' }),
    ])
    expect(outcomes(results).sort()).toEqual(['INVALID_TRANSITION', 'ok'])
    expect((await eventsOf('approve')).length + (await eventsOf('reject')).length).toBe(1)
  })
})
