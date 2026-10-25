import { beforeEach, describe, expect, it } from 'vitest'
import { ids } from '~/server/fixtures/demo'
import { weekDates } from '~/lib/week'
import { getWeekForApproval, listTeamWeeks, weeksWithEntries } from '~/server/services/approvals'
import { createInterval, updateInterval } from '~/server/services/intervals'
import { asUser, at, deps, resetDb } from './helpers'

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

  it('counts entries on any day of the week, not just Monday', async () => {
    // Tue 2026-09-08 10:00–11:00 Perth
    await createInterval(deps(), asUser('operator'), { workerId: ids.opWorker, jobId: ids.j2, startedAt: at(8, 2).toISOString(), endedAt: at(8, 3).toISOString() })
    const out = await weeksWithEntries(deps(), asUser('operator'), { workerId: ids.opWorker, weekStarts: ['2026-09-07'] })
    expect(out).toEqual(['2026-09-07'])
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

describe('rate column (C2)', () => {
  beforeEach(() => resetDb())

  it('interval audit rows carry the rate only for money viewers', async () => {
    const iv = await createInterval(deps(), asUser('operator'), {
      workerId: ids.opWorker, jobId: ids.j1,
      startedAt: at(4, 8).toISOString(), endedAt: at(4, 9).toISOString(),
    })
    const week = { workerId: ids.opWorker, weekStart: '2026-08-31' }
    const billingView = await getWeekForApproval(deps(), asUser('billing'), week)
    const billingRow = billingView.intervals.find((r) => r.id === iv.id)!
    expect(billingRow.rateCents).toBe(12_000) // position posSenior overrides j1's 14_000
    expect(billingView.intervals.every((r) => 'rateCents' in r)).toBe(true) // seeded rows too
    // Operators viewing their own week via the read-only ApproverView path get no rate key (#5).
    const opsView = await getWeekForApproval(deps(), asUser('operator'), week)
    expect(opsView.intervals.some((r) => 'rateCents' in r)).toBe(false)
  })
})

describe('team view (C3)', () => {
  beforeEach(() => resetDb())

  it('team view lists supervisee weeks', async () => {
    const team = await listTeamWeeks(deps(), asUser('operator'), { weeks: 4 })
    expect(team.map((m) => m.workerName).sort()).toEqual(['Atlas', 'Beacon'])
    expect(team[0]!.weeks).toHaveLength(4)
    expect(team[0]!.weeks.every((w) => w.status === 'none')).toBe(true)
    expect(team[0]!.weeks.every((w) => typeof w.flagCount === 'number')).toBe(true)
  })

  it('team view is empty for non-supervisors', async () => {
    expect(await listTeamWeeks(deps(), asUser('billing'), { weeks: 4 })).toEqual([])
  })
})

describe('bulk approve (C4)', () => {
  beforeEach(() => resetDb())

  it('bulk approve handles each week independently', async () => {
    const { submitWeek, approveWeeksBulk } = await import('~/server/services/approvals')
    await submitWeek(deps(), asUser('operator'), { workerId: ids.opWorker, weekStart: '2026-08-31' })
    await submitWeek(deps(), asUser('billing'), { workerId: ids.billingWorker, weekStart: '2026-08-31' })
    const res = await approveWeeksBulk(deps(), asUser('billing'), {
      weeks: [
        { workerId: ids.opWorker, weekStart: '2026-08-31' },
        { workerId: ids.billingWorker, weekStart: '2026-08-31' },
      ],
    })
    expect(res.find((r) => r.workerId === ids.opWorker)!.ok).toBe(true)
    expect(res.find((r) => r.workerId === ids.billingWorker)).toMatchObject({ ok: false, code: 'SELF_APPROVAL' })

    // Already approved → INVALID_TRANSITION per row, without breaking the batch.
    const again = await approveWeeksBulk(deps(), asUser('billing'), {
      weeks: [{ workerId: ids.opWorker, weekStart: '2026-08-31' }],
    })
    expect(again[0]).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' })

    await expect(
      approveWeeksBulk(deps(), asUser('operator'), { weeks: [{ workerId: ids.opWorker, weekStart: '2026-08-31' }] }),
    ).rejects.toMatchObject({ status: 403 })
  })
})

describe('unassigned-entry advisory (4.2)', () => {
  beforeEach(() => resetDb())

  it('week view lists intervals on unassigned jobs when the worker has assignments', async () => {
    // opWorker is assigned to p1 (j1, j2); seeded iv06 (j3) and iv08 (j4) are outside it.
    const week = await getWeekForApproval(deps(), asUser('billing'), { workerId: ids.opWorker, weekStart: '2026-08-31' })
    expect(week.unassignedIntervalIds.sort()).toEqual(['demo-0000-iv-06', 'demo-0000-iv-08'])
    // billingWorker has no assignments → nothing flagged
    const bw = await getWeekForApproval(deps(), asUser('billing'), { workerId: ids.billingWorker, weekStart: '2026-08-31' })
    expect(bw.unassignedIntervalIds).toEqual([])
  })
})
