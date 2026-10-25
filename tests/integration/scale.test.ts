import { beforeAll, describe, expect, it } from 'vitest'
import { asUser, at, db, deps, resetDb, userIdOf } from './helpers'
import { ids } from '~/server/fixtures/demo'
import * as schema from '../../drizzle/schema'
import { listDay } from '~/server/services/intervals'
import { listWorkers } from '~/server/services/workers'
import { adminKpis, operatorLanes, perJob, reconciliation } from '~/server/services/reports'
import { exportCsv, invoiceData } from '~/server/services/exports'
import { getWeekForApproval, listPendingWeeks } from '~/server/services/approvals'
import { listAssignments } from '~/server/services/assignments'
import { allocationReport } from '~/server/services/allocations'

// D1 rejects any statement with more than 100 bound parameters; every list here is past that.
const N = 120
const n = Array.from({ length: N }, (_, i) => i)
const billing = asUser('billing')
const period = { from: '2026-08-31', to: '2026-09-06' }

async function insertChunked<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += 8) await insert(rows.slice(i, i + 8))
}

beforeAll(async () => {
  await resetDb()
  const now = new Date()
  await insertChunked(n, (c) =>
    db.insert(schema.workers).values(c.map((i) => ({ id: `sa-${i}`, kind: 'agent' as const, name: `Agent ${i}`, supervisorId: ids.adminWorker, createdAt: now }))),
  )
  await insertChunked(n, (c) => db.insert(schema.agentWorkers).values(c.map((i) => ({ workerId: `sa-${i}`, model: 'm', framework: 'f' }))))
  await insertChunked(n, (c) =>
    db.insert(schema.workers).values(c.map((i) => ({ id: `sh-${i}`, kind: 'human' as const, createdAt: now }))),
  )
  await insertChunked(n, (c) =>
    db.insert(schema.user).values(c.map((i) => ({ id: userIdOf(`sh-${i}`), name: `Human ${i}`, email: `h${i}@example.com`, emailVerified: true, createdAt: now, updatedAt: now }))),
  )
  await insertChunked(n, (c) => db.insert(schema.humanWorkers).values(c.map((i) => ({ workerId: `sh-${i}`, userId: userIdOf(`sh-${i}`) }))))
  await insertChunked(n, (c) =>
    db.insert(schema.jobs).values(c.map((i) => ({ id: `sj-${i}`, projectId: ids.p2, name: `Job ${i}`, billableRateCents: 10_000, createdAt: now }))),
  )
  const iv = (id: string, workerId: string, jobId: string, start: Date, end: Date) => ({
    id, workerId, jobId, startedAt: start, endedAt: end, rateCents: 10_000, createdBy: workerId, createdAt: now, updatedAt: now,
  })
  // One hour per agent on Fri 2026-09-04, plus 120 five-minute entries for the operator that same week.
  await insertChunked(n, (c) => db.insert(schema.intervals).values(c.map((i) => iv(`sa-iv-${i}`, `sa-${i}`, `sj-${i}`, at(4, 9), at(4, 10)))))
  await insertChunked(n, (c) =>
    db.insert(schema.intervals).values(c.map((i) => iv(`op-iv-${i}`, ids.opWorker, `sj-${i}`, at(4, 0, i * 5), at(4, 0, i * 5 + 5)))),
  )
  await insertChunked(n, (c) =>
    db.insert(schema.assignments).values(c.map((i) => ({ id: `sas-${i}`, workerId: `sa-${i}`, targetKind: 'job' as const, targetId: `sj-${i}`, createdBy: ids.adminWorker, createdAt: now, updatedAt: now }))),
  )
  await insertChunked(n, (c) =>
    db.insert(schema.approvals).values(c.map((i) => ({ id: `sap-${i}`, workerId: `sa-${i}`, weekStart: '2026-08-31', status: 'submitted' as const, createdAt: now, updatedAt: now }))),
  )
})

describe('services past the 100-parameter limit', () => {
  it('lists every worker with invite state', async () => {
    expect((await listWorkers(deps(), billing)).length).toBeGreaterThan(2 * N)
  })

  it('lists a busy day for billing', async () => {
    const day = await listDay(deps(), billing, { date: '2026-09-04' })
    expect(day.intervals.length).toBeGreaterThanOrEqual(2 * N)
  })

  it('builds reports, invoices and exports', async () => {
    expect((await operatorLanes(deps(), billing, period)).length).toBeGreaterThan(N)
    expect((await adminKpis(deps(), billing, { date: '2026-09-04' })).perWorker.length).toBeGreaterThan(N)
    expect((await perJob(deps(), billing, period)).length).toBeGreaterThan(N)
    expect(Object.keys((await reconciliation(deps(), billing, period)).realization ?? {})).toContain(ids.c2)
    expect((await invoiceData(deps(), billing, { clientId: ids.c2, ...period })).lines.length).toBeGreaterThan(N)
    const csv = await exportCsv(deps(), billing, { ...period, view: 'intervals' })
    expect(csv.body.trimEnd().split('\n').length).toBeGreaterThan(2 * N)
    await expect(exportCsv(deps(), billing, { ...period, view: 'daily' })).resolves.toBeDefined()
  })

  it('opens a week with more than 100 intervals and a long approvals queue', async () => {
    const week = await getWeekForApproval(deps(), billing, { workerId: ids.opWorker, weekStart: '2026-08-31' })
    expect(week.intervals.length).toBeGreaterThan(N)
    expect((await listPendingWeeks(deps(), billing)).length).toBeGreaterThanOrEqual(N)
  })

  it('lists assignments and allocations across many workers and jobs', async () => {
    expect((await listAssignments(deps(), billing, {})).length).toBeGreaterThan(N)
    expect((await allocationReport(deps(), billing, {})).length).toBeGreaterThan(N)
  })
})
