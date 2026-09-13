import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { asUser, db, deps, resetDb } from './helpers'
import { ids } from '~/server/fixtures/demo'
import {
  archiveClient,
  archiveProject,
  createClient,
  createJob,
  createProject,
  listStructure,
  updateClient,
  updateJob,
} from '~/server/services/structure'
import {
  archiveWorker,
  createAgentWorker,
  listWorkers,
  setRoles,
  setSupervisor,
  updateAgentWorker,
} from '~/server/services/workers'
import * as schema from '../../drizzle/schema'

beforeEach(resetDb)

describe('listStructure (#5)', () => {
  it('omits billableRateCents for operators and includes it for billing', async () => {
    const opTree = await listStructure(deps(), asUser('operator'), { includeArchived: false })
    const opJson = JSON.stringify(opTree)
    expect(opJson).not.toMatch(/billableRateCents/)

    const billTree = await listStructure(deps(), asUser('billing'), { includeArchived: false })
    expect(JSON.stringify(billTree)).toMatch(/billableRateCents/)
  })

  it('hides archived jobs from the default tree, includes them when asked', async () => {
    await db.update(schema.jobs).set({ archivedAt: new Date() }).where(eq(schema.jobs.id, ids.j1))
    const tree = await listStructure(deps(), asUser('admin'), { includeArchived: false })
    expect(JSON.stringify(tree)).not.toContain(ids.j1)
    const all = await listStructure(deps(), asUser('admin'), { includeArchived: true })
    expect(JSON.stringify(all)).toContain(ids.j1)
  })
})

describe('structure mutations (#5, #18)', () => {
  it('all refuse non-admin callers with FORBIDDEN', async () => {
    await expect(createClient(deps(), asUser('operator'), { name: 'X' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    })
    await expect(createProject(deps(), asUser('billing'), { clientId: ids.c1, name: 'X' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(createJob(deps(), asUser('billing'), { projectId: ids.p1, name: 'X', billableRateCents: null })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(updateClient(deps(), asUser('operator'), { id: ids.c1, name: 'Y' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(updateJob(deps(), asUser('operator'), { id: ids.j1, name: 'Y' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(archiveProject(deps(), asUser('operator'), { id: ids.p1 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(archiveClient(deps(), asUser('operator'), { id: ids.c1 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('updateJob never re-prices existing intervals (#18)', async () => {
    const before = await db
      .select({ r: schema.intervals.rateCents })
      .from(schema.intervals)
      .where(eq(schema.intervals.jobId, ids.j1))
      .all()
    await updateJob(deps(), asUser('admin'), { id: ids.j1, billableRateCents: 99999 })
    const after = await db
      .select({ r: schema.intervals.rateCents })
      .from(schema.intervals)
      .where(eq(schema.intervals.jobId, ids.j1))
      .all()
    expect(after.map((x) => x.r)).toEqual(before.map((x) => x.r))
  })

  it('creates client / project / job in order', async () => {
    const c = await createClient(deps(), asUser('admin'), { name: 'New Client' })
    const p = await createProject(deps(), asUser('admin'), { clientId: c.id, name: 'New Project' })
    const j = await createJob(deps(), asUser('admin'), {
      projectId: p.id,
      name: 'New Job',
      billableRateCents: 15000,
    })
    expect(j.id).toBeTruthy()
    const row = await db.select().from(schema.jobs).where(eq(schema.jobs.id, j.id)).get()
    expect(row?.billableRateCents).toBe(15000)
  })

  it('rejects children of missing or archived parents, and updates of missing rows', async () => {
    await expect(createProject(deps(), asUser('admin'), { clientId: 'nope', name: 'X' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      field: 'clientId',
    })
    await archiveClient(deps(), asUser('admin'), { id: ids.c2 })
    await expect(createProject(deps(), asUser('admin'), { clientId: ids.c2, name: 'X' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      field: 'clientId',
    })
    await expect(createJob(deps(), asUser('admin'), { projectId: 'nope', name: 'X', billableRateCents: null })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      field: 'projectId',
    })
    await expect(updateJob(deps(), asUser('admin'), { id: 'nope', name: 'X' })).rejects.toMatchObject({ code: 'NOT_FOUND', field: 'id' })
    await expect(archiveProject(deps(), asUser('admin'), { id: 'nope' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('null billableRateCents creates a non-billable job', async () => {
    const j = await createJob(deps(), asUser('admin'), {
      projectId: ids.p1,
      name: 'Freebie',
      billableRateCents: null,
    })
    const row = await db.select().from(schema.jobs).where(eq(schema.jobs.id, j.id)).get()
    expect(row?.billableRateCents).toBeNull()
  })
})

describe('listWorkers (#5, #16, #17)', () => {
  it('operator gets only self + supervisees', async () => {
    const mine = await listWorkers(deps(), asUser('operator'))
    const opIds = mine.map((w) => w.workerId).sort()
    expect(opIds).toEqual([ids.opWorker, ids.agent1, ids.agent2].sort())
  })

  it('billing sees all workers', async () => {
    const all = await listWorkers(deps(), asUser('billing'))
    expect(all.length).toBe(5)
  })

  it('humans include user.name, email, roles, supervisorId, inviteState', async () => {
    const humans = (await listWorkers(deps(), asUser('admin'))).filter((w) => w.kind === 'human')
    expect(humans.length).toBeGreaterThan(0)
    for (const h of humans) {
      expect(h).toHaveProperty('name')
      expect(h).toHaveProperty('email')
      expect(h).toHaveProperty('roles')
      expect(h).toHaveProperty('supervisorId')
      expect(h).toHaveProperty('inviteState')
    }
  })
})

describe('createAgentWorker (#24)', () => {
  it('rejects when supervisorId is not a human, field supervisorId', async () => {
    await expect(
      createAgentWorker(deps(), asUser('admin'), {
        name: 'Cato',
        model: 'm',
        framework: 'f',
        status: 'active',
        supervisorId: ids.agent1,
      }),
    ).rejects.toMatchObject({ code: 'SUPERVISOR_NOT_HUMAN', field: 'supervisorId' })
  })

  it('creates an agent when supervisorId is a human', async () => {
    const r = await createAgentWorker(deps(), asUser('admin'), {
      name: 'Cato',
      model: 'claude-opus-5',
      framework: 'langgraph',
      status: 'active',
      supervisorId: ids.opWorker,
    })
    const row = await db.select().from(schema.agentWorkers).where(eq(schema.agentWorkers.workerId, r.workerId)).get()
    expect(row?.model).toBe('claude-opus-5')
  })

  it('non-admin caller is refused', async () => {
    await expect(
      createAgentWorker(deps(), asUser('operator'), {
        name: 'Cato',
        model: 'm',
        framework: 'f',
        status: 'active',
        supervisorId: ids.opWorker,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
  })
})

describe('updateAgentWorker (#24)', () => {
  it('patches agent fields and supervisor; leaves omitted fields alone', async () => {
    await updateAgentWorker(deps(), asUser('admin'), { workerId: ids.agent1, model: 'claude-sonnet-5', status: 'inactive' })
    const a = await db.select().from(schema.agentWorkers).where(eq(schema.agentWorkers.workerId, ids.agent1)).get()
    expect(a).toMatchObject({ model: 'claude-sonnet-5', framework: 'langgraph', status: 'inactive' })
    await updateAgentWorker(deps(), asUser('admin'), { workerId: ids.agent1, name: 'Atlas II', supervisorId: ids.billingWorker })
    const w = await db.select().from(schema.workers).where(eq(schema.workers.id, ids.agent1)).get()
    expect(w).toMatchObject({ name: 'Atlas II', supervisorId: ids.billingWorker })
  })

  it('rejects a non-human supervisor, a human target, an unknown id, and non-admin callers', async () => {
    await expect(
      updateAgentWorker(deps(), asUser('admin'), { workerId: ids.agent1, supervisorId: ids.agent2 }),
    ).rejects.toMatchObject({ code: 'SUPERVISOR_NOT_HUMAN', field: 'supervisorId' })
    await expect(
      updateAgentWorker(deps(), asUser('admin'), { workerId: ids.opWorker, model: 'm' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', field: 'workerId' })
    await expect(
      updateAgentWorker(deps(), asUser('admin'), { workerId: 'nope', model: 'm' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      updateAgentWorker(deps(), asUser('operator'), { workerId: ids.agent1, model: 'm' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
  })
})

describe('setRoles (#5)', () => {
  it('rejects roles without operator, field omitted, code ROLES_MUST_INCLUDE_OPERATOR', async () => {
    await expect(
      setRoles(deps(), asUser('admin'), { workerId: ids.billingWorker, roles: ['billing'] }),
    ).rejects.toMatchObject({ code: 'ROLES_MUST_INCLUDE_OPERATOR', status: 400 })
  })

  it('updates the role JSON for an admin caller', async () => {
    await setRoles(deps(), asUser('admin'), {
      workerId: ids.opWorker,
      roles: ['operator', 'billing'],
    })
    const row = await db.select().from(schema.humanWorkers).where(eq(schema.humanWorkers.workerId, ids.opWorker)).get()
    expect(JSON.parse(row!.roles)).toEqual(['operator', 'billing'])
  })
})

describe('setSupervisor (#24)', () => {
  it('rejects when target worker is an agent', async () => {
    await expect(
      setSupervisor(deps(), asUser('admin'), { workerId: ids.agent1, supervisorId: ids.opWorker }),
    ).rejects.toMatchObject({ code: 'SUPERVISOR_NOT_HUMAN' })
  })

  it('rejects when the new supervisor is an agent', async () => {
    await expect(
      setSupervisor(deps(), asUser('admin'), { workerId: ids.agent1, supervisorId: ids.agent2 }),
    ).rejects.toMatchObject({ code: 'SUPERVISOR_NOT_HUMAN' })
  })

  it('rejects an archived supervisor', async () => {
    await db.update(schema.workers).set({ archivedAt: new Date() }).where(eq(schema.workers.id, ids.billingWorker))
    await expect(
      setSupervisor(deps(), asUser('admin'), { workerId: ids.opWorker, supervisorId: ids.billingWorker }),
    ).rejects.toMatchObject({ code: 'SUPERVISOR_NOT_HUMAN', field: 'supervisorId' })
  })

  it('rejects self-supervision and longer cycles with SUPERVISOR_CYCLE', async () => {
    await expect(
      setSupervisor(deps(), asUser('admin'), { workerId: ids.opWorker, supervisorId: ids.opWorker }),
    ).rejects.toMatchObject({ code: 'SUPERVISOR_CYCLE', field: 'supervisorId', status: 400 })
    await setSupervisor(deps(), asUser('admin'), { workerId: ids.billingWorker, supervisorId: ids.adminWorker })
    await setSupervisor(deps(), asUser('admin'), { workerId: ids.adminWorker, supervisorId: ids.opWorker })
    await expect(
      setSupervisor(deps(), asUser('admin'), { workerId: ids.opWorker, supervisorId: ids.billingWorker }),
    ).rejects.toMatchObject({ code: 'SUPERVISOR_CYCLE' })
  })

  it('allows setting a null supervisor on a human top-level', async () => {
    await setSupervisor(deps(), asUser('admin'), { workerId: ids.billingWorker, supervisorId: null })
    const row = await db.select().from(schema.workers).where(eq(schema.workers.id, ids.billingWorker)).get()
    expect(row?.supervisorId).toBeNull()
  })
})

describe('archiveWorker (#24)', () => {
  it('refuses with HAS_SUPERVISEES (409) when active supervisees remain', async () => {
    await expect(
      archiveWorker(deps(), asUser('admin'), { workerId: ids.opWorker }),
    ).rejects.toMatchObject({ code: 'HAS_SUPERVISEES', status: 409 })
  })

  it('archives when no supervisees', async () => {
    await archiveWorker(deps(), asUser('admin'), { workerId: ids.billingWorker })
    const row = await db.select().from(schema.workers).where(eq(schema.workers.id, ids.billingWorker)).get()
    expect(row?.archivedAt).toBeInstanceOf(Date)
  })

  it('archived workers do not appear in unarchived lists', async () => {
    await archiveWorker(deps(), asUser('admin'), { workerId: ids.billingWorker })
    const all = (await listWorkers(deps(), asUser('admin'))).map((w) => w.workerId)
    expect(all).not.toContain(ids.billingWorker)
  })
})

describe('archived-worker guards (#M8)', () => {
  it('archiveWorker 404s on an unknown id', async () => {
    await expect(
      archiveWorker(deps(), asUser('admin'), { workerId: 'no-such-worker' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', field: 'workerId' })
  })

  it('archiveWorker 404s when the target is already archived', async () => {
    await archiveWorker(deps(), asUser('admin'), { workerId: ids.billingWorker })
    await expect(
      archiveWorker(deps(), asUser('admin'), { workerId: ids.billingWorker }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', field: 'workerId' })
  })

  it('setRoles refuses an archived worker', async () => {
    await archiveWorker(deps(), asUser('admin'), { workerId: ids.billingWorker })
    await expect(
      setRoles(deps(), asUser('admin'), { workerId: ids.billingWorker, roles: ['operator'] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', field: 'workerId' })
  })

  it('setSupervisor refuses an archived target', async () => {
    await archiveWorker(deps(), asUser('admin'), { workerId: ids.billingWorker })
    await expect(
      setSupervisor(deps(), asUser('admin'), { workerId: ids.billingWorker, supervisorId: ids.opWorker }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', field: 'workerId' })
  })
})
