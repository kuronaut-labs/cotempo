import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { asUser, db, deps, resetDb } from './helpers'
import { getOrgSettings, updateOrgSettings } from '~/server/services/settings'
import { orgSettings } from '../../drizzle/schema'
import { insertDemo } from '~/server/fixtures/demo'

beforeEach(async () => {
  await resetDb()
  // resetDb re-seeds with onConflictDoNothing, so mutations on the 'org' row
  // would leak between tests; reset the row fresh each time.
  await db.delete(orgSettings)
  await insertDemo(db)
})

afterAll(async () => {
  // db.close?.() — the vitest-pool workers client owns teardown; no close step needed.
})

describe('settings service', () => {
  it('falls back to 480 / no target when the row is absent', async () => {
    await db.delete(orgSettings)
    const v = await getOrgSettings(deps(), asUser('operator'))
    expect(v.defaultDayMinutes).toBe(480)
    expect(v.defaultWeeklyTargetHours).toBeNull()
    expect('defaultBillableRateCents' in v).toBe(false)
  })

  it('omits the rate key for operators and shows it for billing', async () => {
    const op = await getOrgSettings(deps(), asUser('operator'))
    expect(Object.keys(op)).not.toContain('defaultBillableRateCents')
    const bill = await getOrgSettings(deps(), asUser('billing'))
    expect(bill.defaultBillableRateCents).toBe(10_000)
  })

  it('update is admin-only', async () => {
    await expect(updateOrgSettings(deps(), asUser('billing'), { defaultDayMinutes: 300 })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
    await expect(updateOrgSettings(deps(), asUser('operator'), { defaultDayMinutes: 300 })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })

  it('update patches only provided keys and creates the row on first write', async () => {
    await db.delete(orgSettings)
    const v = await updateOrgSettings(deps(), asUser('admin'), { defaultDayMinutes: 300 })
    expect(v.defaultDayMinutes).toBe(300)
    expect(v.defaultWeeklyTargetHours).toBeNull()
    const bill = await getOrgSettings(deps(), asUser('billing'))
    expect(bill.defaultBillableRateCents).toBeNull()
  })

  it('null clears rate and target; absent keeps them', async () => {
    await updateOrgSettings(deps(), asUser('admin'), { defaultBillableRateCents: null, defaultWeeklyTargetHours: null })
    let bill = await getOrgSettings(deps(), asUser('billing'))
    expect(bill.defaultBillableRateCents).toBeNull()
    expect(bill.defaultWeeklyTargetHours).toBeNull()
    await updateOrgSettings(deps(), asUser('admin'), { defaultBillableRateCents: 5_000 })
    bill = await getOrgSettings(deps(), asUser('billing'))
    expect(bill.defaultBillableRateCents).toBe(5_000)
    expect(bill.defaultWeeklyTargetHours).toBeNull()
  })

  it('sees the seeded values', async () => {
    const bill = await getOrgSettings(deps(), asUser('billing'))
    expect(bill).toMatchObject({ defaultDayMinutes: 480, defaultWeeklyTargetHours: 40, defaultBillableRateCents: 10_000 })
  })
})
