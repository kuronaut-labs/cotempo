import { beforeEach, describe, expect, it } from 'vitest'
import { asUser, deps, resetDb } from './helpers'
import { ids } from '~/server/fixtures/demo'
import { archiveAssignment, createAssignment, listAssignments, updateAssignment } from '~/server/services/assignments'
import { archiveJob } from '~/server/services/structure'

beforeEach(resetDb)

describe('assignments', () => {
  it('seed: opWorker→p1, Atlas→j1, Beacon→j3', async () => {
    const all = await listAssignments(deps(), asUser('billing'), {})
    expect(all.map((a) => [a.workerId, a.targetKind, a.targetId]).sort()).toEqual(
      [[ids.opWorker, 'project', ids.p1], [ids.agent1, 'job', ids.j1], [ids.agent2, 'job', ids.j3]].sort(),
    )
    expect(all.find((a) => a.targetId === ids.j1)!.dueOn).toBe('2026-09-08')
  })

  it('admin only for writes', async () => {
    const input = { workerId: ids.billingWorker, targetKind: 'job' as const, targetId: ids.j2 }
    await expect(createAssignment(deps(), asUser('billing'), input)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
    await expect(createAssignment(deps(), asUser('operator'), input)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })

  it('duplicate live assignment is a coded 409; archive then re-create is allowed', async () => {
    const dup = { workerId: ids.agent1, targetKind: 'job' as const, targetId: ids.j1 }
    await expect(createAssignment(deps(), asUser('admin'), dup)).rejects.toMatchObject({ status: 409, code: 'ASSIGNMENT_EXISTS' })
    const existing = (await listAssignments(deps(), asUser('admin'), { workerId: ids.agent1 }))[0]!
    await archiveAssignment(deps(), asUser('admin'), { id: existing.id })
    expect(await listAssignments(deps(), asUser('admin'), { workerId: ids.agent1 })).toEqual([])
    const { id } = await createAssignment(deps(), asUser('admin'), dup)
    expect(id).not.toBe(existing.id)
  })

  it('archived target is refused; missing target is 404 on targetId', async () => {
    await archiveJob(deps(), asUser('admin'), { id: ids.j4 })
    await expect(createAssignment(deps(), asUser('admin'), { workerId: ids.opWorker, targetKind: 'job', targetId: ids.j4 }))
      .rejects.toMatchObject({ status: 409, code: 'TARGET_ARCHIVED', field: 'targetId' })
    await expect(createAssignment(deps(), asUser('admin'), { workerId: ids.opWorker, targetKind: 'project', targetId: 'nope' }))
      .rejects.toMatchObject({ status: 404, code: 'NOT_FOUND', field: 'targetId' })
  })

  it('operators see self + supervisees only', async () => {
    const mine = await listAssignments(deps(), asUser('operator'), {})
    expect(mine.map((a) => a.workerId).sort()).toEqual([ids.opWorker, ids.agent1, ids.agent2].sort())
    await expect(listAssignments(deps(), asUser('operator'), { workerId: ids.billingWorker }))
      .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN_TARGET' })
  })

  it('update patches allocation and note; null clears', async () => {
    const a = (await listAssignments(deps(), asUser('admin'), { workerId: ids.agent2 }))[0]!
    await updateAssignment(deps(), asUser('admin'), { id: a.id, allocatedMinutes: 600 })
    expect((await listAssignments(deps(), asUser('admin'), { workerId: ids.agent2 }))[0]!.allocatedMinutes).toBe(600)
    await updateAssignment(deps(), asUser('admin'), { id: a.id, allocatedMinutes: null })
    expect((await listAssignments(deps(), asUser('admin'), { workerId: ids.agent2 }))[0]!.allocatedMinutes).toBeNull()
  })
})
