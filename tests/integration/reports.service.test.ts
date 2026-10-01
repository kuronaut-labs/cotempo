import { beforeEach, describe, expect, it } from 'vitest'
import { deps, asUser, resetDb } from './helpers'
import { adminKpis } from '~/server/services/reports'
import { updateOrgSettings } from '~/server/services/settings'
import { db } from './helpers'
import { orgSettings } from '../../drizzle/schema'
import { insertDemo, ids } from '~/server/fixtures/demo'

beforeEach(async () => {
  await resetDb()
  // resetDb re-seeds with onConflictDoNothing; settings mutations would leak — reset the row.
  await db.delete(orgSettings)
  await insertDemo(db)
})

// db.close?.() — the vitest-pool workers client owns teardown; no close step needed.

// Seeded org default: 480 day-minutes / 40 weekly target. Demo day 0 = Monday
// 2026-08-31 in Perth (anchor is 00:00 UTC, Perth +8).
describe('adminKpis', () => {
  it('utilization denominator follows the org day-minutes setting', async () => {
    const base = await adminKpis(deps(), asUser('billing'), { date: '2026-08-31' })
    await updateOrgSettings(deps(), asUser('admin'), { defaultDayMinutes: 240 })
    const k = await adminKpis(deps(), asUser('billing'), { date: '2026-08-31' })
    // same pieces as the 480 case → half the denominator → double the utilization
    expect(k.perWorker.find((w) => w.workerId === ids.opWorker)!.utilization).toBeCloseTo(
      base.perWorker.find((w) => w.workerId === ids.opWorker)!.utilization * 2,
      5,
    )
  })

  it('reports the weekly target and week wall-clock when a target is set', async () => {
    const k = await adminKpis(deps(), asUser('billing'), { date: '2026-08-31' })
    expect(k.weeklyTargetHours).toBe(40) // seeded
    expect(typeof k.weekWallClockMin).toBe('number')
  })

})

describe('weeklyTrends (B1)', () => {
  it('weeklyTrends aggregates the anchor week for billing only', async () => {
    const { weeklyTrends } = await import('~/server/services/reports')
    const rows = await weeklyTrends(deps(), asUser('billing'), { weeks: 8 })
    expect(rows).toHaveLength(8)
    // Anchor Monday 2026-08-31 is the last row (oldest → newest, current week last).
    expect(rows[7]!.weekStart).toBe('2026-08-31')
    expect(rows[7]!.effortMin).toBeGreaterThan(0)
    expect(rows[0]!.effortMin).toBe(0)
    // Seeded week wall = 1440 min (op 780 + Atlas 480 + Beacon 180); 3 humans × 480 × 5 = 7200 → 0.2.
    expect(rows[7]!.utilization).toBeCloseTo(0.2, 5)
    await expect(weeklyTrends(deps(), asUser('operator'), { weeks: 8 })).rejects.toMatchObject({ status: 403 })
  })
})
