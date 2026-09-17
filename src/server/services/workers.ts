import { and, eq, inArray, isNull } from 'drizzle-orm'
import { HttpError } from '~/lib/errors'
import { schema, type Db } from '~/server/db'
import { hasRole, isAdmin, parseRolesOrDefault, type Role, type SessionContext } from '~/server/context'
import { activatedUserIds } from '~/server/inviteState'
import type {
  AgentWorkerInput,
  ArchiveWorkerInput,
  SetRolesInput,
  SetSupervisorInput,
  UpdateAgentWorkerInput,
} from '~/lib/schemas/workers'
import type { Deps } from './deps'

export type HumanWorkerView = {
  workerId: string
  kind: 'human'
  name: string
  email: string
  roles: Role[]
  supervisorId: string | null
  positionId: string | null
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
  const w = await db
    .select({ kind: schema.workers.kind })
    .from(schema.workers)
    .where(and(eq(schema.workers.id, id), isNull(schema.workers.archivedAt)))
    .get()
  if (!w || w.kind !== 'human') throw new HttpError(400, 'SUPERVISOR_NOT_HUMAN', 'supervisorId')
}

// Walks the supervisor chain upward from `supervisorId`; reaching `workerId` would close a loop.
async function assertNoSupervisorCycle(db: Db, workerId: string, supervisorId: string): Promise<void> {
  let cur: string | null = supervisorId
  const seen = new Set<string>()
  while (cur) {
    if (cur === workerId) throw new HttpError(400, 'SUPERVISOR_CYCLE', 'supervisorId')
    if (seen.has(cur)) return // pre-existing loop elsewhere; not made worse here
    seen.add(cur)
    const row: { supervisorId: string | null } | undefined = await db
      .select({ supervisorId: schema.workers.supervisorId })
      .from(schema.workers)
      .where(eq(schema.workers.id, cur))
      .get()
    cur = row?.supervisorId ?? null
  }
}

/** Unarchived workers. Operators receive only self + supervisees; billing/admin everyone. */
export async function listWorkers(deps: Deps, ctx: SessionContext): Promise<WorkerView[]> {
  const { db } = deps
  const scope = new Set<string>([ctx.workerId, ...ctx.superviseeWorkerIds])

  const allWorkers = await db
    .select()
    .from(schema.workers)
    .where(isNull(schema.workers.archivedAt))
    .all()
  const visible = hasRole(ctx, 'billing') ? allWorkers : allWorkers.filter((w) => scope.has(w.id))
  if (visible.length === 0) return []

  const humanIds = visible.filter((w) => w.kind === 'human').map((w) => w.id)
  const agentIds = visible.filter((w) => w.kind === 'agent').map((w) => w.id)

  const humans = humanIds.length
    ? await db
        .select({
          workerId: schema.humanWorkers.workerId,
          userId: schema.humanWorkers.userId,
          roles: schema.humanWorkers.roles,
          name: schema.user.name,
          email: schema.user.email,
          positionId: schema.humanWorkers.positionId,
        })
        .from(schema.humanWorkers)
        .innerJoin(schema.user, eq(schema.user.id, schema.humanWorkers.userId))
        .where(inArray(schema.humanWorkers.workerId, humanIds))
        .all()
    : []
  const humanById = new Map(humans.map((h) => [h.workerId, h]))
  const activated = await activatedUserIds(db, humans.map((h) => h.userId))

  const agents = agentIds.length
    ? await db.select().from(schema.agentWorkers).where(inArray(schema.agentWorkers.workerId, agentIds)).all()
    : []
  const agentById = new Map(agents.map((a) => [a.workerId, a]))

  const out: WorkerView[] = []
  for (const w of visible) {
    if (w.kind === 'human') {
      const h = humanById.get(w.id)
      if (!h) continue
      out.push({
        workerId: w.id,
        kind: 'human',
        name: h.name,
        email: h.email,
        roles: parseRolesOrDefault(h.roles),
        supervisorId: w.supervisorId,
        positionId: h.positionId,
        inviteState: activated.has(h.userId) ? 'active' : 'pending',
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

export async function updateAgentWorker(deps: Deps, ctx: SessionContext, input: UpdateAgentWorkerInput): Promise<void> {
  requireAdmin(ctx)
  const { db } = deps
  const target = await db
    .select({ kind: schema.workers.kind })
    .from(schema.workers)
    .where(and(eq(schema.workers.id, input.workerId), isNull(schema.workers.archivedAt)))
    .get()
  if (!target || target.kind !== 'agent') throw new HttpError(404, 'NOT_FOUND', 'workerId')
  if (input.supervisorId !== undefined) {
    await assertHuman(db, input.supervisorId)
    await assertNoSupervisorCycle(db, input.workerId, input.supervisorId)
  }

  const workerPatch: Partial<typeof schema.workers.$inferInsert> = {}
  if (input.name !== undefined) workerPatch.name = input.name
  if (input.supervisorId !== undefined) workerPatch.supervisorId = input.supervisorId
  const agentPatch: Partial<typeof schema.agentWorkers.$inferInsert> = {}
  if (input.model !== undefined) agentPatch.model = input.model
  if (input.framework !== undefined) agentPatch.framework = input.framework
  if (input.status !== undefined) agentPatch.status = input.status

  const writes = []
  if (Object.keys(workerPatch).length) writes.push(db.update(schema.workers).set(workerPatch).where(eq(schema.workers.id, input.workerId)))
  if (Object.keys(agentPatch).length) writes.push(db.update(schema.agentWorkers).set(agentPatch).where(eq(schema.agentWorkers.workerId, input.workerId)))
  if (writes.length === 1) await writes[0]
  else if (writes.length === 2) await db.batch([writes[0]!, writes[1]!])
}

/** Roles must keep 'operator'. Service re-checks because Zod allows empty arrays of optional roles via partial schemas. */
export async function setRoles(deps: Deps, ctx: SessionContext, input: SetRolesInput): Promise<void> {
  requireAdmin(ctx)
  const { db } = deps
  // Join through workers so we refuse archived targets (assertHuman already
  // does this for supervisors; role changes should follow the same rule). (#M8)
  const exists = await db
    .select({ userId: schema.humanWorkers.userId })
    .from(schema.humanWorkers)
    .innerJoin(schema.workers, eq(schema.workers.id, schema.humanWorkers.workerId))
    .where(and(eq(schema.humanWorkers.workerId, input.workerId), isNull(schema.workers.archivedAt)))
    .get()
  if (!exists) throw new HttpError(404, 'NOT_FOUND', 'workerId')
  const next = input.roles as Role[]
  if (!next.includes('operator')) throw new HttpError(400, 'ROLES_MUST_INCLUDE_OPERATOR', 'roles')
  // user.role is the BetterAuth admin-plugin gate; sync it so a revoked admin
  // loses access to /api/auth/admin/* endpoints (#H1).
  const userRole = next.includes('admin') ? 'admin' : 'user'
  await db.batch([
    db
      .update(schema.humanWorkers)
      .set({ roles: JSON.stringify(next) })
      .where(eq(schema.humanWorkers.workerId, input.workerId)),
    db.update(schema.user).set({ role: userRole }).where(eq(schema.user.id, exists.userId)),
  ])
}

/** Supervisor must be a human or null; a human may supervise humans. */
export async function setSupervisor(deps: Deps, ctx: SessionContext, input: SetSupervisorInput): Promise<void> {
  requireAdmin(ctx)
  const { db } = deps
  const target = await db
    .select({ kind: schema.workers.kind })
    .from(schema.workers)
    .where(and(eq(schema.workers.id, input.workerId), isNull(schema.workers.archivedAt)))
    .get()
  if (!target) throw new HttpError(404, 'NOT_FOUND', 'workerId')
  if (target.kind !== 'human') throw new HttpError(400, 'SUPERVISOR_NOT_HUMAN', 'workerId')
  if (input.supervisorId !== null) {
    await assertHuman(db, input.supervisorId)
    await assertNoSupervisorCycle(db, input.workerId, input.supervisorId)
  }
  await db.update(schema.workers).set({ supervisorId: input.supervisorId }).where(eq(schema.workers.id, input.workerId))
}

/** Refuses with HttpError(409, 'HAS_SUPERVISEES') while unarchived supervisees remain. */
export async function archiveWorker(deps: Deps, ctx: SessionContext, input: ArchiveWorkerInput): Promise<void> {
  requireAdmin(ctx)
  const { db } = deps
  // Existence check first: an unknown id (or already-archived) is 404, not a
  // silent no-op. The supervisee guard is unchanged. (#M8)
  const exists = await db
    .select({ id: schema.workers.id })
    .from(schema.workers)
    .where(and(eq(schema.workers.id, input.workerId), isNull(schema.workers.archivedAt)))
    .get()
  if (!exists) throw new HttpError(404, 'NOT_FOUND', 'workerId')
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
