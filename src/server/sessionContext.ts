import { and, eq, isNull } from 'drizzle-orm'
import { schema, type Db } from '~/server/db'
import { HttpError } from '~/lib/errors'
import type { RawSession, Role, SessionContext } from '~/server/context'

/* Lives apart from authMw so the middleware file has no module-scope DB references;
   anything left there after `.server()` is stripped ends up in the client bundle (#20). */
export async function buildSessionContext(db: Db, raw: NonNullable<RawSession>): Promise<SessionContext> {
  const human = await db
    .select({ workerId: schema.humanWorkers.workerId, roles: schema.humanWorkers.roles, archivedAt: schema.workers.archivedAt })
    .from(schema.humanWorkers)
    .innerJoin(schema.workers, eq(schema.workers.id, schema.humanWorkers.workerId))
    .where(eq(schema.humanWorkers.userId, raw.user.id))
    .get()
  if (!human) throw new HttpError(403, 'NO_WORKER_PROFILE')
  if (human.archivedAt) throw new HttpError(403, 'FORBIDDEN') // archive must also revoke access
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
