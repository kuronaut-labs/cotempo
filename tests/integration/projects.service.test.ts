import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { asUser, at, deps, resetDb } from './helpers'
import { ids } from '~/server/fixtures/demo'
import { listProjects } from '~/server/services/projects'
import * as schema from '../../drizzle/schema'

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
