import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { asUser, deps, resetDb } from './helpers'
import { leaveExportRows } from '~/server/services/leave'
import { exportCsv } from '~/server/services/exports'
import { HttpError } from '~/lib/errors'

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
