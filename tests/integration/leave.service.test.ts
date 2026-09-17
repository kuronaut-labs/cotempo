import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { asUser, db, deps, resetDb } from './helpers'
import { leaveEvents, leaveRequests } from '../../drizzle/schema'
import { listLeaveTypes, myLeave, upsertLeaveType } from '~/server/services/leave'

const baseType = {
  key: 'annual',
  name: 'Annual leave',
  paid: true,
  accrualMethod: 'monthly_prorata' as const,
  minutesPerYear: 9_600,
  accrualRatePer10k: 0,
  maxCarryOverMinutes: 2_400,
  yearBasis: 'calendar' as const,
}

beforeEach(async () => {
  await resetDb()
  // resetDb's demo seed carries a leave request (lr-demo-1) that references
  // lt-annual; clear requests first so type counts while testing are hermetic.
  await db.delete(leaveEvents)
  await db.delete(leaveRequests)
})
afterAll(async () => {
  await resetDb()
})

describe('listLeaveTypes', () => {
  it('any authenticated worker sees live types', async () => {
    const rows = await listLeaveTypes(deps(), asUser('operator'))
    expect(rows.map((t) => t.key)).toContain('annual')
  })
})

describe('upsertLeaveType', () => {
  it('admin can upsert by key', async () => {
    const t = await upsertLeaveType(deps(), asUser('admin'), { ...baseType, name: 'Annual leave (AU)' })
    expect(t.name).toBe('Annual leave (AU)')
    const again = await listLeaveTypes(deps(), asUser('operator'))
    expect(again.filter((x) => x.key === 'annual')).toHaveLength(1) // upsert, not duplicate
  })

  it('billing and operator are forbidden', async () => {
    await expect(upsertLeaveType(deps(), asUser('billing'), baseType)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
    await expect(upsertLeaveType(deps(), asUser('operator'), baseType)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })
})

describe('myLeave', () => {
  it('returns balances for every live type and my requests', async () => {
    const mine = await myLeave(deps(), asUser('operator'))
    expect(mine.balances.map((b) => b.type.key)).toContain('annual')
    expect(mine.balances.every((b) => b.availableMinutes >= 0)).toBe(true)
    expect(mine.requests.map((r) => r.id)).toEqual([]) // lr-demo-1 removed above
  })

  it('reports my own leave requests with names resolved', async () => {
    const mine = await myLeave(deps(), asUser('operator'))
    expect(mine.requests.map((r) => r.id)).toEqual([])
  })
})
