import { beforeEach, describe, expect, it } from 'vitest'
import { asUser, db, deps, resetDb } from '../../integration/helpers'
import { expectCode, perth } from '../_util'
import { ids } from '~/server/fixtures/demo'
import * as schema from '../../../drizzle/schema'
import { DAILY_CSV_COLUMNS, INTERVALS_CSV_COLUMNS, exportCsv, invoiceData } from '~/server/services/exports'
import { reconciliation } from '~/server/services/reports'

const period = { from: '2026-09-01', to: '2026-09-03' }

beforeEach(async () => {
  await resetDb()
  await db.delete(schema.intervals)
  const now = new Date()
  await db.insert(schema.intervals).values([
    { id: 'x1', workerId: ids.opWorker, jobId: ids.j1, rateCents: 14000, startedAt: new Date(perth('2026-09-01', '08:00')), endedAt: new Date(perth('2026-09-01', '10:01')), createdBy: ids.opWorker, createdAt: now, updatedAt: now },
    { id: 'x2', workerId: ids.opWorker, jobId: ids.j3, rateCents: 12000, startedAt: new Date(perth('2026-09-02', '23:00')), endedAt: new Date(perth('2026-09-03', '01:00')), createdBy: ids.opWorker, createdAt: now, updatedAt: now },
    { id: 'x3', workerId: ids.opWorker, jobId: ids.j4, rateCents: null, startedAt: new Date(perth('2026-09-01', '11:00')), endedAt: new Date(perth('2026-09-01', '12:00')), createdBy: ids.opWorker, createdAt: now, updatedAt: now },
  ])
})

const parse = (csv: string) => csv.trim().split('\n').map((l) => l.split(','))

describe('contract #11/#14 CSV', () => {
  it('intervals view: exact header, one row per piece (midnight crossing → two rows), org_timezone column', async () => {
    const { filename, body } = await exportCsv(deps(), asUser('billing'), { ...period, view: 'intervals' })
    expect(filename).toBe('timesheets-2026-09-01_2026-09-03-intervals.csv')
    const rows = parse(body)
    expect(rows[0]).toEqual([...INTERVALS_CSV_COLUMNS])
    expect(rows.length - 1).toBe(4)
    const days = rows.slice(1).map((r) => r[INTERVALS_CSV_COLUMNS.indexOf('day')])
    expect(days.filter((d) => d === '2026-09-02').length).toBe(1)
    expect(days.filter((d) => d === '2026-09-03').length).toBe(1)
    expect(rows[1]?.[INTERVALS_CSV_COLUMNS.indexOf('org_timezone')]).toBe('Australia/Perth')
  })
  it('daily view: exact header; Σ amount_dollars (cents×100 → rounded to $0.01) equals the reconciliation total within per-row rounding', async () => {
    const { body } = await exportCsv(deps(), asUser('billing'), { ...period, view: 'daily' })
    const rows = parse(body)
    expect(rows[0]).toEqual([...DAILY_CSV_COLUMNS])
    const col = DAILY_CSV_COLUMNS.indexOf('amount_dollars')
    // amount_dollars is a fixed-2-decimal string; summing as Number keeps cent-level precision.
    const sum = rows.slice(1).reduce((s, r) => s + Number(r[col]), 0)
    const recon = await reconciliation(deps(), asUser('billing'), period)
    // Each row was rounded to cents; allow up to (rows-1) cents of drift.
    const reconDollars = (recon.total as { cents: number }).cents / 100
    expect(Math.abs(sum - reconDollars)).toBeLessThanOrEqual((rows.length - 1) / 100)
  })
  it('export is billing-only at the service level', async () => {
    await expectCode(exportCsv(deps(), asUser('operator'), { ...period, view: 'daily' }), 'FORBIDDEN')
  })
})

describe('contract #11/#18 invoice', () => {
  it('lines per job, subtotal = Σ line cents, trio footer, non-billable job excluded from lines', async () => {
    const inv = await invoiceData(deps(), asUser('billing'), { clientId: ids.c2, ...period })
    expect(inv.client.id).toBe(ids.c2)
    expect(inv.lines.map((l) => l.jobId)).toEqual([ids.j3])
    expect(inv.lines[0]).toMatchObject({ billableMin: 120, rateCents: 12000, cents: 24000 })
    expect(inv.subtotalCents).toBe(inv.lines.reduce((s, l) => s + l.cents, 0))
    expect(inv.recon).toMatchObject({ effortMin: 180, wallClockMin: 180, premiumMin: 0, billableMin: 120 })
    expect(inv.orgTimezone).toBe('Australia/Perth')
  })
  it('rounding: 121 minutes at $140/h is 28233 cents on the line (once), not 28234', async () => {
    const inv = await invoiceData(deps(), asUser('billing'), { clientId: ids.c1, ...period })
    expect(inv.lines.find((l) => l.jobId === ids.j1)?.cents).toBe(28233)
  })
})
