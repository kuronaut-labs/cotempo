import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { asUser, db, deps, resetDb } from '../../integration/helpers'
import { deepHasKey, expectCode } from '../_util'
import { ids } from '~/server/fixtures/demo'
import * as schema from '../../../drizzle/schema'
import { archiveJob, listStructure, updateJob } from '~/server/services/structure'
import { archiveWorker, createAgentWorker, listWorkers, setRoles, setSupervisor } from '~/server/services/workers'

beforeEach(resetDb)

describe('contract #5 operators see no money', () => {
  it('listStructure omits billableRateCents for operators and includes it for billing', async () => {
    const opTree = await listStructure(deps(), asUser('operator'), { includeArchived: false })
    expect(opTree.length).toBe(2)
    expect(deepHasKey(opTree, 'billableRateCents')).toBe(false)
    const billTree = await listStructure(deps(), asUser('billing'), { includeArchived: false })
    expect(deepHasKey(billTree, 'billableRateCents')).toBe(true)
  })
})

describe('contract #18/#24 jobs', () => {
  it('rate change never touches existing intervals', async () => {
    await updateJob(deps(), asUser('admin'), { id: ids.j1, billableRateCents: 20000 })
    const rates = (await db.select({ r: schema.intervals.rateCents }).from(schema.intervals).where(eq(schema.intervals.jobId, ids.j1)).all()).map((x) => x.r)
    expect(rates.every((r) => r === 14000)).toBe(true)
  })
  it('archived job is hidden from the picker tree by default and shown with includeArchived', async () => {
    await archiveJob(deps(), asUser('admin'), { id: ids.j1 })
    const tree = await listStructure(deps(), asUser('admin'), { includeArchived: false })
    expect(deepHasKey(tree, 'archivedAt')).toBe(true)
    expect(JSON.stringify(tree)).not.toContain(ids.j1)
    const all = await listStructure(deps(), asUser('admin'), { includeArchived: true })
    expect(JSON.stringify(all)).toContain(ids.j1)
  })
  it('structure mutations are admin-only at the service level too', async () => {
    await expectCode(updateJob(deps(), asUser('billing'), { id: ids.j1, name: 'x' }), 'FORBIDDEN')
  })
})

describe('contract #4/#5/#17 workers', () => {
  it('operator listWorkers returns only self + supervisees', async () => {
    const mine = await listWorkers(deps(), asUser('operator'))
    expect(mine.map((w) => w.workerId).sort()).toEqual([ids.opWorker, ids.agent1, ids.agent2].sort())
    expect((await listWorkers(deps(), asUser('billing'))).length).toBe(5)
  })
  it('agents need a human supervisor', async () => {
    await expectCode(createAgentWorker(deps(), asUser('admin'), { name: 'Cato', model: 'm', framework: 'f', status: 'active', supervisorId: ids.agent1 }), 'SUPERVISOR_NOT_HUMAN', { field: 'supervisorId' })
    await expect(createAgentWorker(deps(), asUser('admin'), { name: 'Cato', model: 'm', framework: 'f', status: 'active', supervisorId: ids.billingWorker })).resolves.toBeTruthy()
    await expectCode(setSupervisor(deps(), asUser('admin'), { workerId: ids.agent1, supervisorId: ids.agent2 }), 'SUPERVISOR_NOT_HUMAN')
  })
  it('roles must keep operator', async () => {
    await expectCode(setRoles(deps(), asUser('admin'), { workerId: ids.billingWorker, roles: ['billing'] as never }), 'ROLES_MUST_INCLUDE_OPERATOR')
  })
  it('archiving a supervisor with active supervisees is refused; archived workers vanish from lists', async () => {
    await expectCode(archiveWorker(deps(), asUser('admin'), { workerId: ids.opWorker }), 'HAS_SUPERVISEES', { status: 409 })
    await archiveWorker(deps(), asUser('admin'), { workerId: ids.agent2 })
    expect((await listWorkers(deps(), asUser('admin'))).map((w) => w.workerId)).not.toContain(ids.agent2)
  })
  it('humans with no session ever are pending invites', async () => {
    const humans = (await listWorkers(deps(), asUser('admin'))).filter((w) => w.kind === 'human')
    expect(humans.every((h) => h.inviteState === 'pending')).toBe(true)
  })
})
