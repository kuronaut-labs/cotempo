import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { HttpError } from '~/lib/errors'
import { canSeeMoney, isAdmin, type SessionContext } from '~/server/context'
import { schema } from '~/server/db'
import type { Deps } from './deps'
import type {
  ArchivePositionInput, PositionInput, SetWorkerPositionInput, UpdatePositionInput,
} from '~/lib/schemas/positions'

export type PositionView = {
  id: string
  name: string
  rateCents: number
  createdAt: Date
}

// rateCents is money (#5) — the whole view is billing/admin only
export async function listPositions(deps: Deps, _ctx: SessionContext): Promise<PositionView[]> {
  if (!canSeeMoney(_ctx)) throw new HttpError(403, 'FORBIDDEN')
  const rows = await deps.db.select().from(schema.positions)
    .where(isNull(schema.positions.archivedAt))
    .orderBy(asc(schema.positions.name))
  return rows.map((r) => ({ id: r.id, name: r.name, rateCents: r.rateCents, createdAt: r.createdAt }))
}

export async function createPosition(deps: Deps, ctx: SessionContext, input: PositionInput): Promise<PositionView> {
  if (!isAdmin(ctx)) throw new HttpError(403, 'FORBIDDEN')
  const id = crypto.randomUUID()
  const createdAt = deps.now()
  await deps.db.insert(schema.positions)
    .values({ id, name: input.name, rateCents: input.rateCents, createdAt })
  return { id, name: input.name, rateCents: input.rateCents, createdAt }
}

export async function updatePosition(deps: Deps, ctx: SessionContext, input: UpdatePositionInput): Promise<PositionView> {
  if (!isAdmin(ctx)) throw new HttpError(403, 'FORBIDDEN')
  const patch: { name?: string; rateCents?: number } = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.rateCents !== undefined) patch.rateCents = input.rateCents
  // changing the rate affects only NEW intervals — existing rate_cents never moves (#18)
  const rows = await deps.db.update(schema.positions).set(patch)
    .where(and(eq(schema.positions.id, input.id), isNull(schema.positions.archivedAt)))
    .returning()
  if (rows.length === 0) throw new HttpError(404, 'POSITION_NOT_FOUND', 'id')
  const r = rows[0]!
  return { id: r.id, name: r.name, rateCents: r.rateCents, createdAt: r.createdAt }
}

export async function archivePosition(deps: Deps, ctx: SessionContext, input: ArchivePositionInput): Promise<void> {
  if (!isAdmin(ctx)) throw new HttpError(403, 'FORBIDDEN')
  const holders = await deps.db.select({ count: sql<number>`count(*)` })
    .from(schema.humanWorkers)
    .innerJoin(schema.workers, eq(schema.humanWorkers.workerId, schema.workers.id))
    .where(and(eq(schema.humanWorkers.positionId, input.id), isNull(schema.workers.archivedAt)))
  if ((holders[0]?.count ?? 0) > 0) {
    throw new HttpError(409, 'POSITION_IN_USE', 'id', { count: holders[0]!.count })
  }
  const rows = await deps.db.update(schema.positions)
    .set({ archivedAt: deps.now() })
    .where(and(eq(schema.positions.id, input.id), isNull(schema.positions.archivedAt)))
    .returning({ id: schema.positions.id })
  if (rows.length === 0) throw new HttpError(404, 'POSITION_NOT_FOUND', 'id')
}

export async function setWorkerPosition(deps: Deps, ctx: SessionContext, input: SetWorkerPositionInput): Promise<void> {
  if (!isAdmin(ctx)) throw new HttpError(403, 'FORBIDDEN')
  const targets = await deps.db.select({ kind: schema.workers.kind })
    .from(schema.workers)
    .where(and(eq(schema.workers.id, input.workerId), isNull(schema.workers.archivedAt)))
  if (targets.length === 0) throw new HttpError(404, 'NOT_FOUND', 'workerId')
  if (targets[0]!.kind !== 'human') throw new HttpError(400, 'WORKER_NOT_HUMAN', 'workerId')
  if (input.positionId !== null) {
    const pos = await deps.db.select({ id: schema.positions.id })
      .from(schema.positions)
      .where(and(eq(schema.positions.id, input.positionId), isNull(schema.positions.archivedAt)))
    if (pos.length === 0) throw new HttpError(404, 'POSITION_NOT_FOUND', 'positionId')
  }
  await deps.db.update(schema.humanWorkers)
    .set({ positionId: input.positionId })
    .where(eq(schema.humanWorkers.workerId, input.workerId))
}
