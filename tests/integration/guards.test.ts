import { beforeEach, describe, expect, it } from 'vitest'
import { asUser, db, resetDb, setWeekStatus } from './helpers'
import { ids } from '~/server/fixtures/demo'
import { assertCanEditWorker, assertCanViewWorker } from '~/server/guards/worker'
import { assertWeeksEditable, resetSubmittedWeeks } from '~/server/guards/week'
import { buildSessionContext } from '~/server/middleware/authMw'
import * as schema from '../../drizzle/schema'
import { eq } from 'drizzle-orm'

beforeEach(resetDb)

describe('assertCanEditWorker (#17)', () => {
  it('operator edits self and supervisees only', () => {
    const op = asUser('operator')
    expect(() => assertCanEditWorker(op, ids.opWorker)).not.toThrow()
    expect(() => assertCanEditWorker(op, ids.agent1)).not.toThrow()
    expect(() => assertCanEditWorker(op, ids.billingWorker)).toThrow('FORBIDDEN_TARGET')
  })
  it('billing gains nothing', () => {
    expect(() => assertCanEditWorker(asUser('billing'), ids.opWorker)).toThrow('FORBIDDEN_TARGET')
  })
  it('admin edits anyone', () => {
    expect(() => assertCanEditWorker(asUser('admin'), ids.opWorker)).not.toThrow()
  })
})

describe('assertCanViewWorker (#5)', () => {
  it('billing views anyone; operator only scope', () => {
    expect(() => assertCanViewWorker(asUser('billing'), ids.opWorker)).not.toThrow()
    expect(() => assertCanViewWorker(asUser('operator'), ids.billingWorker)).toThrow('FORBIDDEN_TARGET')
  })
})

describe('assertWeeksEditable / resetSubmittedWeeks (#26)', () => {
  it('approved locks, submitted does not', async () => {
    await setWeekStatus(ids.opWorker, '2026-08-31', 'approved')
    await setWeekStatus(ids.opWorker, '2026-09-07', 'submitted')
    await expect(assertWeeksEditable(db, ids.opWorker, ['2026-08-31'])).rejects.toThrow('WEEK_LOCKED')
    await expect(assertWeeksEditable(db, ids.opWorker, ['2026-09-07'])).resolves.toBeUndefined()
    await expect(assertWeeksEditable(db, ids.opWorker, ['2026-09-07', '2026-08-31'])).rejects.toThrow('WEEK_LOCKED')
  })
  it('lock is per worker', async () => {
    await setWeekStatus(ids.opWorker, '2026-08-31', 'approved')
    await expect(assertWeeksEditable(db, ids.agent1, ['2026-08-31'])).resolves.toBeUndefined()
  })
  it('reset flips submitted to draft and writes an edited_after_submit event', async () => {
    await setWeekStatus(ids.opWorker, '2026-09-07', 'submitted')
    await setWeekStatus(ids.opWorker, '2026-08-31', 'draft')
    await resetSubmittedWeeks(db, ids.opWorker, ['2026-09-07', '2026-08-31'], ids.adminWorker)
    const rows = await db.select().from(schema.approvals).where(eq(schema.approvals.workerId, ids.opWorker)).all()
    expect(rows.every((r) => r.status === 'draft')).toBe(true)
    const events = await db.select().from(schema.approvalEvents).all()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'edited_after_submit', actorWorkerId: ids.adminWorker })
  })
})

describe('buildSessionContext (#8)', () => {
  const rawFor = (userId: string) =>
    ({ user: { id: userId, email: 'x@example.com', name: 'X' }, session: { id: 's' } }) as unknown as Parameters<typeof buildSessionContext>[1]

  it('returns roles and supervisees for the operator', async () => {
    const ctx = await buildSessionContext(db, rawFor(`user-${ids.opWorker}`))
    expect(ctx.workerId).toBe(ids.opWorker)
    expect(ctx.roles).toEqual(['operator'])
    expect(ctx.superviseeWorkerIds.sort()).toEqual([ids.agent1, ids.agent2].sort())
  })
  it('throws NO_WORKER_PROFILE for an unknown user', async () => {
    await expect(buildSessionContext(db, rawFor('nobody'))).rejects.toThrow('NO_WORKER_PROFILE')
  })
  it('throws FORBIDDEN for an archived worker', async () => {
    await db.update(schema.workers).set({ archivedAt: new Date() }).where(eq(schema.workers.id, ids.billingWorker))
    await expect(buildSessionContext(db, rawFor(`user-${ids.billingWorker}`))).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    })
  })
})
