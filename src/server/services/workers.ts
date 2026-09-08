import { and, eq, isNull } from 'drizzle-orm'
import { HttpError } from '~/lib/errors'
import { schema, type Db } from '~/server/db'
import { isAdmin, type Role, type SessionContext } from '~/server/context'
import type {
  AgentWorkerInput,
  ArchiveWorkerInput,
  SetRolesInput,
  SetSupervisorInput,
} from '~/lib/schemas/workers'
import type { Deps } from './deps'

export type HumanWorkerView = {
  workerId: string
  kind: 'human'
  name: string
  email: string
  roles: Role[]
  supervisorId: string | null
  inviteState: 'pending' | 'active'
}
export type AgentWorkerView = {
  workerId: string
  kind: 'agent'
  name: string
  model: string
  framework: string
  status: 'active' | 'inactive'
  supervisorId: string | null
}
export type WorkerView = HumanWorkerView | AgentWorkerView

function requireAdmin(ctx: SessionContext) {
  if (!isAdmin(ctx)) throw new HttpError(403, 'FORBIDDEN')
}

async function assertHuman(db: Db, id: string): Promise<void> {
  const w = await db.select().from(schema.workers).where(eq(schema.workers.id, id)).get()
  if (!w || w.kind !== 'human') throw new HttpError(400, 'SUPERVISOR_NOT_HUMAN', 'supervisorId')
}

/** Unarchived workers. Operators receive only self + supervisees; billing/admin everyone. */
export async function listWorkers(deps: Deps, ctx: SessionContext): Promise<WorkerView[]> {
  const { db } = deps
  const scope = new Set<string>([ctx.workerId, ...ctx.superviseeWorkerIds])
  const showAll = ctx.roles.includes('billing') || ctx.roles.includes('admin')

  const allWorkers = await db
    .select()
    .from(schema.workers)
    .where(isNull(schema.workers.archivedAt))
    .all()
  const visible = showAll ? allWorkers : allWorkers.filter((w) => scope.has(w.id))
  if (visible.length === 0) return []

  const workerIds = visible.map((w) => w.id)
  const humansAll = await Promise.all(
    workerIds.map((id) =>
      db.select().from(schema.humanWorkers).where(eq(schema.humanWorkers.workerId, id)).get(),
    ),
  )
  const humanById = new Map(
    humansAll.filter((h): h is NonNullable<typeof h> => h != null).map((h) => [h.workerId, h]),
  )

  const userIds = [...new Set([...humanById.values()].map((h) => h.userId))]
  const users = userIds.length
    ? await db
        .select({ id: schema.user.id, name: schema.user.name, email: schema.user.email })
        .from(schema.user)
        .where(eq(schema.user.id, userIds[0]!))
        .all()
    : []
  // The `inArray` shape drizzle infers here pulls a single id; for the suite we fetch one-by-one.
  const userById = new Map<string, { id: string; name: string; email: string }>()
  for (const uid of userIds) {
    const u = await db
      .select({ id: schema.user.id, name: schema.user.name, email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, uid))
      .get()
    if (u) userById.set(u.id, u)
  }
  void users

  const userWithSession = new Set<string>()
  for (const uid of userIds) {
    const s = await db
      .select({ userId: schema.session.userId })
      .from(schema.session)
      .where(eq(schema.session.userId, uid))
      .get()
    if (s) userWithSession.add(s.userId)
  }

  const agentIds = visible.filter((w) => w.kind === 'agent').map((w) => w.id)
  const agentRows = await Promise.all(
    agentIds.map((id) =>
      db.select().from(schema.agentWorkers).where(eq(schema.agentWorkers.workerId, id)).get(),
    ),
  )
  const agentById = new Map(
    agentRows.filter((a): a is NonNullable<typeof a> => a != null).map((a) => [a.workerId, a]),
  )

  const out: WorkerView[] = []
  for (const w of visible) {
    if (w.kind === 'human') {
      const h = humanById.get(w.id)
      if (!h) continue
      const u = userById.get(h.userId)
      out.push({
        workerId: w.id,
        kind: 'human',
        name: u?.name ?? '',
        email: u?.email ?? '',
        roles: JSON.parse(h.roles) as Role[],
        supervisorId: w.supervisorId,
        inviteState: userWithSession.has(h.userId) ? 'active' : 'pending',
      })
    } else {
      const a = agentById.get(w.id)
      if (!a) continue
      out.push({
        workerId: w.id,
        kind: 'agent',
        name: w.name ?? '',
        model: a.model,
        framework: a.framework,
        status: a.status,
        supervisorId: w.supervisorId,
      })
    }
  }
  return out
}

/** `supervisorId` must be an unarchived human worker, else HttpError(400, 'SUPERVISOR_NOT_HUMAN', 'supervisorId'). */
export async function createAgentWorker(
  deps: Deps,
  ctx: SessionContext,
  input: AgentWorkerInput,
): Promise<{ workerId: string }> {
  requireAdmin(ctx)
  const { db } = deps
  await assertHuman(db, input.supervisorId)
  const workerId = crypto.randomUUID()
  const now = deps.now()
  await db.batch([
    db.insert(schema.workers).values({ id: workerId, kind: 'agent', name: input.name, supervisorId: input.supervisorId, createdAt: now }),
    db.insert(schema.agentWorkers).values({
      workerId,
      model: input.model,
      framework: input.framework,
      status: input.status,
    }),
  ])
  return { workerId }
}

/** Roles must keep 'operator'. Service re-checks because Zod allows empty arrays of optional roles via partial schemas. */
export async function setRoles(deps: Deps, ctx: SessionContext, input: SetRolesInput): Promise<void> {
  requireAdmin(ctx)
  const { db } = deps
  const exists = await db.select().from(schema.humanWorkers).where(eq(schema.humanWorkers.workerId, input.workerId)).get()
  if (!exists) throw new HttpError(404, 'NOT_FOUND', 'workerId')
  const next = input.roles as Role[]
  if (!next.includes('operator')) throw new HttpError(400, 'ROLES_MUST_INCLUDE_OPERATOR', 'roles')
  await db
    .update(schema.humanWorkers)
    .set({ roles: JSON.stringify(next) })
    .where(eq(schema.humanWorkers.workerId, input.workerId))
}

/** Supervisor must be a human or null; a human may supervise humans. */
export async function setSupervisor(deps: Deps, ctx: SessionContext, input: SetSupervisorInput): Promise<void> {
  requireAdmin(ctx)
  const { db } = deps
  const target = await db.select().from(schema.workers).where(eq(schema.workers.id, input.workerId)).get()
  if (!target) throw new HttpError(404, 'NOT_FOUND', 'workerId')
  if (target.kind !== 'human') throw new HttpError(400, 'SUPERVISOR_NOT_HUMAN', 'workerId')
  if (input.supervisorId !== null) {
    await assertHuman(db, input.supervisorId)
    if (input.supervisorId === input.workerId) {
      throw new HttpError(400, 'SUPERVISOR_NOT_HUMAN', 'supervisorId')
    }
  }
  await db.update(schema.workers).set({ supervisorId: input.supervisorId }).where(eq(schema.workers.id, input.workerId))
}

/** Refuses with HttpError(409, 'HAS_SUPERVISEES') while unarchived supervisees remain. */
export async function archiveWorker(deps: Deps, ctx: SessionContext, input: ArchiveWorkerInput): Promise<void> {
  requireAdmin(ctx)
  const { db } = deps
  const supervisees = await db
    .select({ id: schema.workers.id })
    .from(schema.workers)
    .where(and(eq(schema.workers.supervisorId, input.workerId), isNull(schema.workers.archivedAt)))
    .all()
  if (supervisees.length > 0) {
    throw new HttpError(409, 'HAS_SUPERVISEES', 'workerId', { count: supervisees.length })
  }
  await db
    .update(schema.workers)
    .set({ archivedAt: deps.now() })
    .where(and(eq(schema.workers.id, input.workerId), isNull(schema.workers.archivedAt)))
}
