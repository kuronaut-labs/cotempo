import { beforeEach, describe, expect, it } from 'vitest'
import { ids } from '~/server/fixtures/demo'
import { weekDates } from '~/lib/week'
import { getWeekForApproval, weeksWithEntries } from '~/server/services/approvals'
import { createInterval, updateInterval } from '~/server/services/intervals'
import { asUser, at, db, deps, resetDb } from './helpers'

describe('weeksWithEntries', () => {
  beforeEach(() => resetDb())

  it('returns the seeded week (the week containing the demo anchor) and no empty weeks', async () => {
    const tz = deps().tz
    // seed data sits in the week of the anchor; probe that week and one before/after
    const before = ['2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07']
    const out = await weeksWithEntries(deps(), asUser('operator'), { workerId: ids.opWorker, weekStarts: before })
    expect(out).toEqual(['2026-08-31'])
    expect(weekDates(out[0]!).length).toBe(7)
    void tz
  })

  it('views someone else only within scope', async () => {
    await expect(
      weeksWithEntries(deps(), asUser('operator'), { workerId: ids.billingWorker, weekStarts: ['2026-08-31'] }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN_TARGET' })
  })
})

describe('audit timeline (interval events) (C1)', () => {
  beforeEach(() => resetDb())

  it('week view merges interval events into the audit data', async () => {
    const iv = await createInterval(deps(), asUser('operator'), {
      workerId: ids.opWorker, jobId: ids.j1,
      startedAt: at(4, 8).toISOString(), endedAt: at(4, 12).toISOString(),
    })
    await updateInterval(deps(), asUser('operator'), { id: iv.id, note: 'focus' })
    const week = await getWeekForApproval(deps(), asUser('billing'), { workerId: ids.opWorker, weekStart: '2026-08-31' })
    const kinds = week.intervalEvents.map((e) => e.kind)
    expect(kinds).toEqual(expect.arrayContaining(['create', 'edit']))
    const edit = week.intervalEvents.find((e) => e.kind === 'edit')!
    expect(edit.actorName).toBe('Demo Operator')
    expect((edit.changes!.note as { from: unknown }).from).toBeNull()
  })

  it('operators never receive the rateCents diff (#5)', async () => {
    const iv = await createInterval(deps(), asUser('operator'), {
      workerId: ids.opWorker, jobId: ids.j1,
      startedAt: at(4, 8).toISOString(), endedAt: at(4, 12).toISOString(),
    })
    // Move to a non-billable job: rateCents appears only for billing.
    await updateInterval(deps(), asUser('admin'), { id: iv.id, jobId: ids.j4 })
    const billingView = await getWeekForApproval(deps(), asUser('billing'), { workerId: ids.opWorker, weekStart: '2026-08-31' })
    const opsView = await getWeekForApproval(deps(), asUser('operator'), { workerId: ids.opWorker, weekStart: '2026-08-31' })
    const bHas = billingView.intervalEvents.some((e) => e.changes && 'rateCents' in e.changes)
    const oHas = opsView.intervalEvents.some((e) => e.changes && 'rateCents' in e.changes)
    expect(bHas).toBe(true)
    expect(oHas).toBe(false)
    // jobId diff is kept for both (not money).
    expect(billingView.intervalEvents.find((e) => e.kind === 'edit')!.changes).toHaveProperty('jobId')
  })
})
