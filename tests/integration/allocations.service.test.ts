import { beforeEach, describe, expect, it } from 'vitest'
import { asUser, deps, resetDb } from './helpers'
import { ids } from '~/server/fixtures/demo'
import { allocationReport } from '~/server/services/allocations'

beforeEach(resetDb)

describe('allocationReport', () => {
  it('project assignment rolls up every job under the project; job assignment is narrower', async () => {
    const rows = await allocationReport(deps(), asUser('billing'), {})
    const op = rows.find((r) => r.workerId === ids.opWorker)!
    // opWorker on p1 (j1 + j2): seeded day0 09–12 ∪ 10–11 = 180, day1 09–13 = 240, day2 14–18 = 240 → 660 wall min
    expect(op.loggedMinutes).toBe(660)
    expect(op.allocatedMinutes).toBe(2400)
    expect(op.remainingMinutes).toBe(1740)
    const atlas = rows.find((r) => r.workerId === ids.agent1)!
    expect(atlas.loggedMinutes).toBe(480) // seeded iv03 only
    expect(atlas.pace).not.toBe('n/a') // 1200 allocated, due 2026-09-08
    expect(rows.find((r) => r.workerId === ids.agent2)!.pace).toBe('n/a') // no allocation
  })

  it('never carries money', async () => {
    const rows = await allocationReport(deps(), asUser('admin'), {})
    expect(JSON.stringify(rows)).not.toMatch(/cents/i)
  })

  it('operators get self + supervisees only', async () => {
    const rows = await allocationReport(deps(), asUser('operator'), {})
    expect(rows.map((r) => r.workerId).sort()).toEqual([ids.opWorker, ids.agent1, ids.agent2].sort())
  })
})
