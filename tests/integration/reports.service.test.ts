import { beforeEach, describe, expect, it } from 'vitest'
import { deps, asUser, resetDb } from './helpers'
import { adminKpis } from '~/server/services/reports'
import { updateOrgSettings } from '~/server/services/settings'
import { ids } from '~/server/fixtures/demo'

beforeEach(async () => {
  await resetDb()
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
