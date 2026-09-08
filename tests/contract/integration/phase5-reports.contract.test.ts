import { beforeEach, describe, expect, it } from 'vitest'
import { asUser, db, deps, resetDb } from '../../integration/helpers'
import { deepHasKey, expectCode, perth } from '../_util'
import { ids } from '~/server/fixtures/demo'
import * as schema from '../../../drizzle/schema'
import { daily, perJob, reconciliation, adminKpis, operatorLanes } from '~/server/services/reports'

/* Controlled data set (Perth). Fixture intervals are deleted so totals are exact.
   Day 2026-09-01: op j1 08–12 (14000), op j2 10–11 (9000), agent1 j1 08–10 (14000), op j4 13–14 (null)
   Day 2026-09-02 23:00 → 09-03 01:00: op j3 (12000) — crosses midnight.                         */
async function seed() {
  await db.delete(schema.intervals)
  const now = new Date()
  const row = (id: string, workerId: string, jobId: string, rateCents: number | null, s: string, e: string) => ({
    id,
    workerId,
    jobId,
    rateCents,
    startedAt: new Date(s),
    endedAt: new Date(e),
    createdBy: workerId === ids.agent1 ? ids.opWorker : workerId,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(schema.intervals).values([
    row('r1', ids.opWorker, ids.j1, 14000, perth('2026-09-01', '08:00'), perth('2026-09-01', '12:00')),
    row('r2', ids.opWorker, ids.j2, 9000, perth('2026-09-01', '10:00'), perth('2026-09-01', '11:00')),
    row('r3', ids.agent1, ids.j1, 14000, perth('2026-09-01', '08:00'), perth('2026-09-01', '10:00')),
    row('r4', ids.opWorker, ids.j4, null, perth('2026-09-01', '13:00'), perth('2026-09-01', '14:00')),
    row('r5', ids.opWorker, ids.j3, 12000, perth('2026-09-02', '23:00'), perth('2026-09-03', '01:00')),
  ])
}

const period = { from: '2026-09-01', to: '2026-09-03' }

beforeEach(async () => {
  await resetDb()
  await seed()
})

describe('contract #5 money visibility', () => {
  it('operator responses contain no cents key anywhere; billing responses do', async () => {
    const op = asUser('operator')
    for (const r of [await reconciliation(deps(), op, period), await daily(deps(), op, period), await perJob(deps(), op, period), await operatorLanes(deps(), op, period)]) {
      expect(deepHasKey(r, 'cents')).toBe(false)
      expect(deepHasKey(r, 'rateCents')).toBe(false)
    }
    expect(deepHasKey(await reconciliation(deps(), asUser('billing'), period), 'cents')).toBe(true)
    expect(deepHasKey(await daily(deps(), asUser('billing'), period), 'cents')).toBe(true)
  })
  it('adminKpis is refused for operators at the service level', async () => {
    await expectCode(adminKpis(deps(), asUser('operator'), { date: '2026-09-01' }), 'FORBIDDEN')
  })
})

describe('contract #7/#14/#18 figures', () => {
  it('reconciliation per client: Acme = op(j1 240 + j2 60) + agent1(j1 120)', async () => {
    const r = await reconciliation(deps(), asUser('billing'), period)
    const acme = r.clients.find((c) => c.clientId === ids.c1)!
    expect(acme).toMatchObject({ effortMin: 420, wallClockMin: 360, premiumMin: 60, billableMin: 420 })
    // 240×14000 + 60×9000 + 120×14000 = 3_360_000 + 540_000 + 1_680_000 = 5_580_000 / 60
    expect((acme as { cents: number }).cents).toBe(93000)
    const nimbus = r.clients.find((c) => c.clientId === ids.c2)!
    expect(nimbus).toMatchObject({ effortMin: 180, wallClockMin: 180, premiumMin: 0, billableMin: 120 })
    expect((nimbus as { cents: number }).cents).toBe(24000)
    expect(r.total).toMatchObject({ effortMin: 600, wallClockMin: 540, premiumMin: 60, billableMin: 540 })
  })
  it('non-billable time counts toward effort and wall-clock but not billable minutes or cents', async () => {
    const r = await reconciliation(deps(), asUser('billing'), { from: '2026-09-01', to: '2026-09-01' })
    const nimbus = r.clients.find((c) => c.clientId === ids.c2)!
    expect(nimbus).toMatchObject({ effortMin: 60, billableMin: 0 })
    expect((nimbus as { cents: number }).cents).toBe(0)
  })
  it('daily splits the midnight-crossing interval across two days and totals equal reconciliation', async () => {
    const d = await daily(deps(), asUser('billing'), period)
    expect(d.days).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])
    expect(d.cells['2026-09-02']?.[ids.c2]).toMatchObject({ effortMin: 60, billableMin: 60 })
    expect(d.cells['2026-09-03']?.[ids.c2]).toMatchObject({ effortMin: 60, billableMin: 60 })
    const r = await reconciliation(deps(), asUser('billing'), period)
    expect(d.totals.all).toEqual(r.total)
    expect(d.totals.byClient[ids.c1]).toEqual(r.clients.find((c) => c.clientId === ids.c1)!)
  })
  it('wall-clock is per worker then summed: two workers 08–10 on Acme count 240, not 120', async () => {
    const r = await reconciliation(deps(), asUser('billing'), { from: '2026-09-01', to: '2026-09-01' })
    const acme = r.clients.find((c) => c.clientId === ids.c1)!
    expect(acme.wallClockMin).toBe(360) // op union 08–12 = 240, agent1 08–10 = 120
  })
  it('operator scope: an operator sees only self + supervisees in reports', async () => {
    const now = new Date()
    await db.insert(schema.intervals).values({
      id: 'r9',
      workerId: ids.billingWorker,
      jobId: ids.j1,
      rateCents: 14000,
      startedAt: new Date(perth('2026-09-01', '08:00')),
      endedAt: new Date(perth('2026-09-01', '09:00')),
      createdBy: ids.billingWorker,
      createdAt: now,
      updatedAt: now,
    })
    const r = await reconciliation(deps(), asUser('operator'), period)
    expect(r.total.effortMin).toBe(600)
    expect((await reconciliation(deps(), asUser('billing'), period)).total.effortMin).toBe(660)
  })
})
