import { and, eq, inArray, isNull } from 'drizzle-orm'
import { HttpError } from '~/lib/errors'
import {
  ArchiveAssignmentInput,
  CreateAssignmentInput,
  ListAssignmentsInput,
  UpdateAssignmentInput,
} from '~/lib/schemas/assignments'
import { isAdmin, hasRole, type SessionContext } from '~/server/context'
import { schema, type Db } from '~/server/db'
import { inChunks } from '~/server/inChunks'
import type { Deps } from './deps'

export type AssignmentView = {
  id: string
  workerId: string
  workerName: string
  targetKind: 'project' | 'job'
  targetId: string
  targetName: string
  projectId: string
  clientId: string
  allocatedMinutes: number | null
  note: string | null
  dueOn: string | null
  createdAt: Date
}

function requireAdmin(ctx: SessionContext) {
  if (!isAdmin(ctx)) throw new HttpError(403, 'FORBIDDEN')
}

/** Projects (with client/dueOn) or jobs (joined to their project) — one of the two by kind. */
async function resolveTarget(
  db: Db,
  kind: 'project' | 'job',
  id: string,
): Promise<{ name: string; projectId: string; clientId: string; dueOn: string | null }> {
  if (kind === 'project') {
    const row = await db
      .select({ id: schema.projects.id, name: schema.projects.name, clientId: schema.projects.clientId, dueOn: schema.projects.dueOn, archivedAt: schema.projects.archivedAt })
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get()
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'targetId')
    if (row.archivedAt) throw new HttpError(409, 'TARGET_ARCHIVED', 'targetId')
    return { name: row.name, projectId: row.id, clientId: row.clientId, dueOn: row.dueOn }
  }
  const row = await db
    .select({
      name: schema.jobs.name,
      projectId: schema.jobs.projectId,
      clientId: schema.projects.clientId,
      pDueOn: schema.projects.dueOn,
      jDueOn: schema.jobs.dueOn,
      archivedAt: schema.jobs.archivedAt,
    })
    .from(schema.jobs)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.jobs.projectId))
    .where(eq(schema.jobs.id, id))
    .get()
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'targetId')
  if (row.archivedAt) throw new HttpError(409, 'TARGET_ARCHIVED', 'targetId')
  return { name: row.name, projectId: row.projectId, clientId: row.clientId, dueOn: row.jDueOn ?? row.pDueOn }
}

async function assertWorker(db: Db, workerId: string) {
  const row = await db
    .select({ archivedAt: schema.workers.archivedAt })
    .from(schema.workers)
    .where(eq(schema.workers.id, workerId))
    .get()
  if (!row || row.archivedAt) throw new HttpError(404, 'NOT_FOUND', 'workerId')
}

function scopeFor(ctx: SessionContext): string[] {
  return isAdmin(ctx) ? [] : [ctx.workerId, ...ctx.superviseeWorkerIds]
}

async function assertTargetVisible(ctx: SessionContext, workerId?: string) {
  if (hasRole(ctx, 'billing')) return
  if (!workerId) return
  const allowed = scopeFor(ctx)
  if (!allowed.includes(workerId)) throw new HttpError(403, 'FORBIDDEN_TARGET', 'workerId')
}

export async function listAssignments(deps: Deps, ctx: SessionContext, input: ListAssignmentsInput): Promise<AssignmentView[]> {
  const { db } = deps
  await assertTargetVisible(ctx, input.workerId)
  const scoping = hasRole(ctx, 'billing') ? undefined : scopeFor(ctx)
  const rows = await db
    .select({
      id: schema.assignments.id,
      workerId: schema.assignments.workerId,
      targetKind: schema.assignments.targetKind,
      targetId: schema.assignments.targetId,
      allocatedMinutes: schema.assignments.allocatedMinutes,
      note: schema.assignments.note,
      createdAt: schema.assignments.createdAt,
    })
    .from(schema.assignments)
    .where(
      and(
        isNull(schema.assignments.archivedAt),
        input.workerId ? eq(schema.assignments.workerId, input.workerId) : undefined,
        scoping?.length ? inArray(schema.assignments.workerId, scoping) : undefined,
      ),
    )
    .all()

  const projectIds = rows.filter((r) => r.targetKind === 'project').map((r) => r.targetId)
  const jobIds = rows.filter((r) => r.targetKind === 'job').map((r) => r.targetId)

  const projRows = await inChunks(projectIds, (chunk) =>
    db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        dueOn: schema.projects.dueOn,
        clientId: schema.projects.clientId,
      })
      .from(schema.projects)
      .where(inArray(schema.projects.id, chunk))
      .all(),
  )
  const jobRows = await inChunks(jobIds, (chunk) =>
    db
      .select({
        id: schema.jobs.id,
        name: schema.jobs.name,
        jDueOn: schema.jobs.dueOn,
        projectId: schema.jobs.projectId,
        clientId: schema.projects.clientId,
        pDueOn: schema.projects.dueOn,
      })
      .from(schema.jobs)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.jobs.projectId))
      .where(inArray(schema.jobs.id, chunk))
      .all(),
  )
  const projById = new Map(projRows.map((p) => [p.id, p]))
  const jobById = new Map(jobRows.map((j) => [j.id, j]))

  const names = await workerNamesVia(db, rows.map((r) => r.workerId))

  const out = rows.map((r) => {
    if (r.targetKind === 'project') {
      const p = projById.get(r.targetId)
      return {
        ...r,
        targetKind: 'project' as const,
        targetName: p?.name ?? '?',
        projectId: r.targetId,
        clientId: p?.clientId ?? '?',
        dueOn: p?.dueOn ?? null,
        workerName: names.get(r.workerId) ?? '?',
      }
    }
    const j = jobById.get(r.targetId)
    return {
      ...r,
      targetKind: 'job' as const,
      targetName: j?.name ?? '?',
      projectId: j?.projectId ?? '?',
      clientId: j?.clientId ?? '?',
      dueOn: j ? (j.jDueOn ?? j.pDueOn) : null,
      workerName: names.get(r.workerId) ?? '?',
    }
  })
  out.sort((a, b) => a.workerName.localeCompare(b.workerName) || a.targetName.localeCompare(b.targetName))
  return out
}

async function workerNamesVia(db: Db, workerIds: string[]): Promise<Map<string, string>> {
  if (workerIds.length === 0) return new Map()
  const rows = await inChunks(workerIds, (chunk) =>
    db
      .select({ workerId: schema.workers.id, workerName: schema.workers.name, userName: schema.user.name })
      .from(schema.workers)
      .leftJoin(schema.humanWorkers, eq(schema.humanWorkers.workerId, schema.workers.id))
      .leftJoin(schema.user, eq(schema.user.id, schema.humanWorkers.userId))
      .where(inArray(schema.workers.id, chunk))
      .all(),
  )
  return new Map(rows.map((r) => [r.workerId, r.userName ?? r.workerName ?? '?']))
}

export async function createAssignment(
  deps: Deps,
  ctx: SessionContext,
  input: CreateAssignmentInput,
): Promise<{ id: string }> {
  const { db } = deps
  requireAdmin(ctx)
  await assertWorker(db, input.workerId)
  await resolveTarget(db, input.targetKind, input.targetId)
  const dup = await db
    .select({ id: schema.assignments.id })
    .from(schema.assignments)
    .where(
      and(
        eq(schema.assignments.workerId, input.workerId),
        eq(schema.assignments.targetKind, input.targetKind),
        eq(schema.assignments.targetId, input.targetId),
        isNull(schema.assignments.archivedAt),
      ),
    )
    .get()
  if (dup) throw new HttpError(409, 'ASSIGNMENT_EXISTS', 'targetId', { conflictingId: dup.id })
  const now = deps.now()
  const id = `asg-${crypto.randomUUID()}`
  try {
    await db.insert(schema.assignments).values({
      id,
      workerId: input.workerId,
      targetKind: input.targetKind,
      targetId: input.targetId,
      allocatedMinutes: input.allocatedMinutes ?? null,
      note: input.note ?? null,
      createdBy: ctx.workerId,
      createdAt: now,
      updatedAt: now,
    })
  } catch {
    // The pre-check closes the common path; this catch closes the race on the unique index.
    const existing = await db
      .select({ id: schema.assignments.id })
      .from(schema.assignments)
      .where(
        and(
          eq(schema.assignments.workerId, input.workerId),
          eq(schema.assignments.targetKind, input.targetKind),
          eq(schema.assignments.targetId, input.targetId),
          isNull(schema.assignments.archivedAt),
        ),
      )
      .get()
    throw new HttpError(409, 'ASSIGNMENT_EXISTS', 'targetId', { conflictingId: existing?.id })
  }
  return { id }
}

export async function updateAssignment(deps: Deps, ctx: SessionContext, input: UpdateAssignmentInput): Promise<void> {
  requireAdmin(ctx)
  const { db } = deps
  const row = await db.select({ id: schema.assignments.id }).from(schema.assignments).where(and(eq(schema.assignments.id, input.id), isNull(schema.assignments.archivedAt))).get()
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'id')
  await db
    .update(schema.assignments)
    .set({
      ...(input.allocatedMinutes !== undefined ? { allocatedMinutes: input.allocatedMinutes ?? null } : {}),
      ...(input.note !== undefined ? { note: input.note ?? null } : {}),
      updatedAt: deps.now(),
    })
    .where(eq(schema.assignments.id, input.id))
}

export async function archiveAssignment(deps: Deps, ctx: SessionContext, input: ArchiveAssignmentInput): Promise<void> {
  requireAdmin(ctx)
  const { db } = deps
  const row = await db.select({ id: schema.assignments.id }).from(schema.assignments).where(and(eq(schema.assignments.id, input.id), isNull(schema.assignments.archivedAt))).get()
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'id')
  await db.update(schema.assignments).set({ archivedAt: deps.now() }).where(eq(schema.assignments.id, row.id))
}
