import { beforeEach, describe, expect, it } from 'vitest'
import { and, eq, isNull } from 'drizzle-orm'
import { deps, asUser, db, resetDb } from './helpers'
import { ids } from '../../src/server/fixtures/demo'
import { schema } from '~/server/db'
import * as svc from '~/server/services/positions'

beforeEach(async () => {
  await resetDb()
})

describe('positions service', () => {
  it('billing sees seeded positions with rates', async () => {
    const rows = await svc.listPositions(deps(), asUser('billing'))
    const senior = rows.find((r) => r.id === ids.posSenior)
    expect(senior?.name).toBe('Senior developer')
    expect(senior?.rateCents).toBe(12_000)
  })

  it('operator cannot list positions', async () => {
    await expect(svc.listPositions(deps(), asUser('operator'))).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    })
  })

  it('admin creates a position', async () => {
    const v = await svc.createPosition(deps(), asUser('admin'), { name: 'Support engineer', rateCents: 8_000 })
    expect(v.name).toBe('Support engineer')
    expect(v.rateCents).toBe(8_000)
  })

  it('billing cannot create', async () => {
    await expect(
      svc.createPosition(deps(), asUser('billing'), { name: 'X', rateCents: 1 }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })

  it('update patches only defined keys', async () => {
    const v = await svc.updatePosition(deps(), asUser('admin'), { id: ids.posDesigner, rateCents: 9_500 })
    expect(v.rateCents).toBe(9_500)
    expect(v.name).toBe('Designer')
  })

  it('update unknown position → POSITION_NOT_FOUND', async () => {
    await expect(
      svc.updatePosition(deps(), asUser('admin'), { id: 'pos-nope', name: 'X' }),
    ).rejects.toMatchObject({ status: 404, code: 'POSITION_NOT_FOUND', field: 'id' })
  })

  it('archive blocked while a live worker holds it', async () => {
    // ops worker is seeded onto posSenior (A1)
    await expect(
      svc.archivePosition(deps(), asUser('admin'), { id: ids.posSenior }),
    ).rejects.toMatchObject({ status: 409, code: 'POSITION_IN_USE', field: 'id' })
  })

  it('archive clears once unassigned', async () => {
    await svc.setWorkerPosition(deps(), asUser('admin'), { workerId: ids.opWorker, positionId: null })
    await svc.archivePosition(deps(), asUser('admin'), { id: ids.posSenior })
    const live = await db.select().from(schema.positions)
      .where(and(eq(schema.positions.id, ids.posSenior), isNull(schema.positions.archivedAt)))
    expect(live).toHaveLength(0)
  })

  it('setWorkerPosition assigns and clears', async () => {
    await svc.setWorkerPosition(deps(), asUser('admin'), { workerId: ids.opWorker, positionId: ids.posDesigner })
    let row = await db.select().from(schema.humanWorkers).where(eq(schema.humanWorkers.workerId, ids.opWorker))
    expect(row[0]?.positionId).toBe(ids.posDesigner)

    await svc.setWorkerPosition(deps(), asUser('admin'), { workerId: ids.opWorker, positionId: null })
    row = await db.select().from(schema.humanWorkers).where(eq(schema.humanWorkers.workerId, ids.opWorker))
    expect(row[0]?.positionId).toBeNull()
  })

  it('setWorkerPosition rejects agents', async () => {
    await expect(
      svc.setWorkerPosition(deps(), asUser('admin'), { workerId: ids.agent1, positionId: ids.posDesigner }),
    ).rejects.toMatchObject({ status: 400, code: 'WORKER_NOT_HUMAN', field: 'workerId' })
  })

  it('setWorkerPosition rejects unknown position and unknown worker', async () => {
    await expect(
      svc.setWorkerPosition(deps(), asUser('admin'), { workerId: ids.opWorker, positionId: 'pos-nope' }),
    ).rejects.toMatchObject({ status: 404, code: 'POSITION_NOT_FOUND', field: 'positionId' })
    await expect(
      svc.setWorkerPosition(deps(), asUser('admin'), { workerId: 'w-nope', positionId: ids.posDesigner }),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND', field: 'workerId' })
  })

  it('operator cannot assign', async () => {
    await expect(
      svc.setWorkerPosition(deps(), asUser('operator'), { workerId: ids.opWorker, positionId: null }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })
})
