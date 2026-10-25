import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { asUser, at, deps, resetDb } from './helpers'
import { leaveExportRows } from '~/server/services/leave'
import { INTERVALS_CSV_COLUMNS, exportCsv, invoiceData } from '~/server/services/exports'
import { createInterval } from '~/server/services/intervals'
import { HttpError } from '~/lib/errors'
import { ids } from '../../src/server/fixtures/demo'

// Demo seed ships an approved leave request (lr-demo-1, lt-annual, 2026-09-24..25,
// decided by the demo billing worker) inside the period below — reuse it.
const period = { from: '2026-09-01', to: '2026-09-30' }

describe('leave exports', () => {
  beforeEach(() => resetDb())

  afterAll(async () => {
    await resetDb()
  })

  it('exports approved leave rows with worker, type, and decidedBy names', async () => {
    const rows = await leaveExportRows(deps(), asUser('billing'), period)
    expect(rows).toHaveLength(1)
    const r = rows[0]!
    expect(r.workerName).toBe('Demo Operator')
    expect(r.typeName).toBe('Annual leave')
    expect(r.startDay).toBe('2026-09-24')
    expect(r.endDay).toBe('2026-09-25')
    expect(r.minutes).toBe(960)
    expect(r.status).toBe('approved')
    expect(r.decidedBy).toBe('Demo Billing')

    const csv = await exportCsv(deps(), asUser('billing'), { ...period, view: 'leave' })
    const lines = csv.body.trimEnd().split('\n')
    expect(lines[0]).toBe('worker,type,startDay,endDay,hours,status,decidedBy')
    expect(lines[1]).toContain('Demo Operator,Annual leave,2026-09-24,2026-09-25,16.00,approved,Demo Billing')
    expect(csv.filename).toContain('-leave.csv')
  })

  it('forbids operators from exporting leave', async () => {
    await expect(leaveExportRows(deps(), asUser('operator'), period)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    } satisfies Partial<HttpError>)
    await expect(
      exportCsv(deps(), asUser('operator'), { ...period, view: 'leave' }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' } satisfies Partial<HttpError>)
  })
})

describe('audit CSV (C5)', () => {
  beforeEach(() => resetDb())

  it('audit CSV exports approval, leave and interval events for billing', async () => {
    const { submitWeek } = await import('~/server/services/approvals')
    await submitWeek(deps(), asUser('operator'), { workerId: ids.opWorker, weekStart: '2026-08-31' })
    const res = await exportCsv(deps(), asUser('billing'), { from: '2000-01-01', to: '2100-01-01', view: 'events' })
    expect(res.body.split('\n')[0]).toBe('at,kind,worker,subject,actor,detail')
    expect(res.body).toContain('submit')
    expect(res.body).toContain('Demo Operator')
    expect(res.body).toContain('leave_approve') // seeded leave request lr-demo-1's event
    expect(res.filename).toContain('events')
  })

  it('audit CSV is billing-only', async () => {
    await expect(
      exportCsv(deps(), asUser('operator'), { from: '2000-01-01', to: '2100-01-01', view: 'events' }),
    ).rejects.toMatchObject({ status: 403 })
  })
})

describe('allocations CSV (Task 3.2)', () => {
  beforeEach(() => resetDb())

  it('billing export of allocations has the header and three data rows', async () => {
    const res = await exportCsv(deps(), asUser('billing'), { from: '2000-01-01', to: '2100-01-01', view: 'allocations' })
    const lines = res.body.trimEnd().split('\n')
    expect(lines[0]).toBe('worker,kind,target_kind,target,client,due_on,allocated_minutes,logged_minutes,remaining_minutes,pace')
    expect(lines.length).toBe(4)
    expect(lines.slice(1).some((l) => l.includes(',project,')))
    expect(res.filename).toContain('-allocations.csv')
  })

  it('operators cannot export allocations', async () => {
    await expect(
      exportCsv(deps(), asUser('operator'), { from: '2000-01-01', to: '2100-01-01', view: 'allocations' }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' } satisfies Partial<HttpError>)
  })
})

describe('entity-scoped exports (Task 4.1)', () => {
  beforeEach(() => resetDb())

  afterAll(async () => {
    await resetDb()
  })

  it('intervals view with clientId c2 has only j3/j4 rows', async () => {
    const res = await exportCsv(deps(), asUser('billing'), { ...period, view: 'intervals', clientId: ids.c2 })
    const lines = res.body.trim().split('\n')
    expect(lines.length).toBeGreaterThan(1)
    const jobs = lines.slice(1).map((l) => l.split(',')[4])
    expect(jobs.every((j) => j === 'Route Model Tuning' || j === 'Internal Data Cleansing')).toBe(true)
    expect(jobs.includes('Internal Data Cleansing')).toBe(true)
  })

  it('intervals view with projectId p1 has only j1/j2 rows', async () => {
    const res = await exportCsv(deps(), asUser('billing'), { ...period, view: 'intervals', projectId: ids.p1 })
    const lines = res.body.trim().split('\n')
    expect(lines.length).toBeGreaterThan(1)
    const jobs = lines.slice(1).map((l) => l.split(',')[4])
    expect(jobs.every((j) => j === 'Pipeline Maintenance' || j === 'Eval Harness Runs')).toBe(true)
  })
})

describe('invoice lines (#18)', () => {
  beforeEach(() => resetDb())

  it('splits a job into one line per snapshot rate so each line multiplies out', async () => {
    // opWorker's position (12_000) overrides j1's 14_000 on new entries
    await createInterval(deps(), asUser('operator'), {
      workerId: ids.opWorker,
      jobId: ids.j1,
      startedAt: at(4, 9).toISOString(),
      endedAt: at(4, 10).toISOString(),
    })
    const inv = await invoiceData(deps(), asUser('billing'), { clientId: ids.c1, from: '2026-08-31', to: '2026-09-06' })
    const j1 = inv.lines.filter((l) => l.jobId === ids.j1)
    expect(j1.map((l) => l.rateCents)).toEqual([12_000, 14_000])
    expect(j1[0]).toMatchObject({ billableMin: 60, cents: 12_000 })
    for (const l of inv.lines) expect(l.cents).toBe(Math.floor((l.billableMin * l.rateCents!) / 60 + 0.5))
    expect(inv.subtotalCents).toBe(inv.lines.reduce((s, l) => s + l.cents, 0))
  })
})

describe('intervals CSV worker-day columns (#M2)', () => {
  beforeEach(() => resetDb())

  it('repeats the worker-day clock and overlap minutes on each of that day\'s rows', async () => {
    // Fixture: the operator's 01 (3h) and 02 (1h, inside 01) on Mon 2026-08-31 Perth → clock 180, overlap 60.
    const csv = await exportCsv(deps(), asUser('billing'), { from: '2026-08-31', to: '2026-08-31', view: 'intervals' })
    const [head, ...lines] = csv.body.trimEnd().split('\n')
    expect(head).toBe(INTERVALS_CSV_COLUMNS.join(','))
    const col = (name: (typeof INTERVALS_CSV_COLUMNS)[number]) => INTERVALS_CSV_COLUMNS.indexOf(name)
    const mine = lines.map((l) => l.split(',')).filter((c) => c[col('worker')] === 'Demo Operator')
    expect(mine).toHaveLength(2)
    for (const c of mine) {
      expect(c[col('clock_minutes')]).toBe('180')
      expect(c[col('overlap_minutes')]).toBe('60')
    }
  })
})
