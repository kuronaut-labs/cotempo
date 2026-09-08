import { createMiddleware } from '@tanstack/react-start'
import { and, eq, isNull } from 'drizzle-orm'
import { getDb, schema, type Db } from '~/server/db'
import { HttpError } from '~/lib/errors'
import type { RawSession, Role, SessionContext } from '~/server/context'

export async function buildSessionContext(db: Db, raw: NonNullable<RawSession>): Promise<SessionContext> {
  const human = await db.select().from(schema.humanWorkers).where(eq(schema.humanWorkers.userId, raw.user.id)).get()
  if (!human) throw new HttpError(403, 'NO_WORKER_PROFILE')
  const roles = JSON.parse(human.roles) as Role[]
  if (!roles.includes('operator')) throw new HttpError(403, 'ROLES_MISSING_OPERATOR')
  const supervisees = await db
    .select({ id: schema.workers.id })
    .from(schema.workers)
    .where(and(eq(schema.workers.supervisorId, human.workerId), isNull(schema.workers.archivedAt)))
    .all()
  return {
    userId: raw.user.id,
    email: raw.user.email,
    name: raw.user.name,
    workerId: human.workerId,
    roles,
    superviseeWorkerIds: supervisees.map((s) => s.id),
  }
}

export const authMw = createMiddleware({ type: 'function' }).server(async ({ context, next }) => {
  const raw = (context as unknown as { rawSession?: RawSession }).rawSession
  if (!raw) throw new HttpError(401, 'UNAUTHENTICATED')
  const sessionCtx = await buildSessionContext(getDb(), raw)
  return next({ context: { sessionCtx } })
})

/** Reads the context `authMw` attached; use in every fn handler instead of casting inline. */
export const ctxOf = (context: unknown): SessionContext => (context as { sessionCtx: SessionContext }).sessionCtx
