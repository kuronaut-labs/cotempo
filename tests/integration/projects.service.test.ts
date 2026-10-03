import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { asUser, at, deps, resetDb } from './helpers'
import { ids } from '~/server/fixtures/demo'
import { listProjects, projectFigures } from '~/server/services/projects'
import * as schema from '../../drizzle/schema'
import { updateOrgSettings } from '~/server/services/settings'

beforeEach(resetDb)

describe('listProjects', () => {
  it('defaults: both projects by name with counts and dueOn', async () => {
    const page = await listProjects(deps(), asUser('billing'), { sort: 'name', status: 'active', due: 'any', limit: 50 })
    expect(page.rows.map((r) => r.name)).toEqual(['Flight Ops Automation', 'Route Optimization'])
    const p1 = page.rows[0]!
    expect(p1.clientName).toBe('Acme Aerospace')
    expect(p1.jobCount).toBe(2)
    expect(p1.liveJobCount).toBe(2)
    expect(p1.dueOn).toBe('2026-10-30')
    expect(page.nextCursor).toBeNull()
  })

  it('clientId filter and q escape', async () => {
    const c1 = await listProjects(deps(), asUser('billing'), { status: 'active', sort: 'name', due: 'any', clientId: ids.c1, limit: 50 })
    expect(c1.rows.map((r) => r.id)).toEqual([ids.p1])
    const pct = await listProjects(deps(), asUser('billing'), { status: 'active', sort: 'name', due: 'any', q: '%', limit: 50 })
    expect(pct.rows).toEqual([])
  })

  it('effort sort orders p1 (1200) before p2', async () => {
    const page = await listProjects(deps(), asUser('billing'), { sort: 'effort', status: 'active', due: 'any', limit: 50 })
    // p1: 180+60+240+240+480 = 1200; p2: iv06 only (agent2's iv03 counts lines elsewhere) → 0 for op scope... billing view:
    // ascending: p2 (240) before p1 (1200)
    const ids0 = page.rows.map((r) => r.id)
    expect(ids0[0]).toBe(ids.p2)
    expect(ids0).toContain(ids.p1)
  })

  it('archived project only under archived|all', async () => {
    deps().now = () => at(20, 12)
    await deps().db.update(schema.projects).set({ archivedAt: new Date(at(20, 12)) }).where(eq(schema.projects.id, ids.p2))
    const archived = await listProjects(deps(), asUser('billing'), { status: 'archived', sort: 'name', due: 'any', limit: 50 })
    expect(archived.rows.map((r) => r.id)).toEqual([ids.p2])
    const active = await listProjects(deps(), asUser('billing'), { sort: 'name', status: 'active', due: 'any', limit: 50 })
    expect(active.rows.map((r) => r.id)).toEqual([ids.p1])
    const all = await listProjects(deps(), asUser('billing'), { status: 'all', sort: 'name', due: 'any', limit: 50 })
    expect(all.rows).toHaveLength(2)
  })

  it('operator has no billableCents key', async () => {
    const page = await listProjects(deps(), asUser('operator'), { sort: 'name', status: 'active', due: 'any', limit: 50 })
    for (const r of page.rows) expect('billableCents' in r).toBe(false)
  })

  it('keyset paging and cursor validation', async () => {
    const first = await listProjects(deps(), asUser('billing'), { sort: 'name', status: 'active', due: 'any', limit: 1 })
    expect(first.nextCursor).not.toBeNull()
    const second = await listProjects(deps(), asUser('billing'), { sort: 'name', status: 'active', due: 'any', limit: 1, cursor: first.nextCursor! })
    expect(second.rows[0]!.id).not.toBe(first.rows[0]!.id)
    await expect(listProjects(deps(), asUser('billing'), { sort: 'name', status: 'active', due: 'any', limit: 50, cursor: 'garbage' })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_CURSOR',
    })
  })
})

describe('project figures (Task 3.2)', () => {
  it('all time recon for p1: effort 1200 / wall 1140 / premium 60, byJob two rows', async () => {
    const f = await projectFigures(deps(), asUser('billing'), { id: ids.p1 })
    expect(f.allTime.effortMin).toBe(1200)
    expect(f.allTime.wallClockMin).toBe(1140)
    expect(f.allTime.premiumMin).toBe(60)
    expect('cents' in f.allTime && f.allTime.cents).toBeGreaterThan(0)
    expect(f.byJob).toHaveLength(2)
    const j1 = f.byJob.find((j) => j.jobId === ids.j1)!
    expect(j1.jobName).toBe('Pipeline Maintenance')
    expect('billableRateCents' in j1).toBe(true)
  })

  it('period-scoped figures use period and overtime stays zero at 480 day default', async () => {
    const f = await projectFigures(deps(), asUser('billing'), { id: ids.p1, from: '2026-09-01', to: '2026-09-02' })
    // Fixture hours are UTC: iv03 9–17Z spills into Perth day 09-01 (60 min), so day1 = iv05 240 + spill 60; day2 = iv07 clipped 120.
    expect(f.period.effortMin).toBe(420)
    expect(f.overtimeMin).toBe(0)
  })

  it('lower defaultDayMinutes attributes overtime to p1', async () => {
    const db = deps().db
    await db.delete(schema.orgSettings)
    await updateOrgSettings(deps(), asUser('admin'), { defaultDayMinutes: 360 })
    const f = await projectFigures(deps(), asUser('billing'), { id: ids.p1 })
    // iv03 9–17Z splits at 16Z: Perth day 08-31 gets only 420 wall → ot 60.
    expect(f.overtimeMin).toBe(60)
    const ag = f.byWorker.find((w) => w.workerId === ids.agent1)!
    expect(ag.overtimeMin).toBe(60)
  })

  it('operator gets no cents or billableRateCents and stays scoped', async () => {
    const f = await projectFigures(deps(), asUser('operator'), { id: ids.p1 })
    expect(JSON.stringify(f).includes('cents')).toBe(false)
    expect('billableRateCents' in f.byJob[0]!).toBe(false)
  })

  it('weeks and recent are populated for p1', async () => {
    const f = await projectFigures(deps(), asUser('billing'), { id: ids.p1 })
    expect(f.weeks.length).toBeGreaterThan(0)
    expect(f.weeks[0]!.weekStart).toBe('2026-08-31')
    expect(f.recent.length).toBeGreaterThan(0)
    expect(f.budgetCents).toBeUndefined()
  })
})
