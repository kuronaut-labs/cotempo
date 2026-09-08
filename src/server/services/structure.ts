import { and, eq, isNull } from 'drizzle-orm'
import { HttpError } from '~/lib/errors'
import { schema } from '~/server/db'
import { canSeeMoney, isAdmin, type SessionContext } from '~/server/context'
import type {
  ArchiveInput,
  CreateClientInput,
  CreateJobInput,
  CreateProjectInput,
  ListStructureInput,
  UpdateClientInput,
  UpdateJobInput,
  UpdateProjectInput,
} from '~/lib/schemas/structure'
import type { Deps } from './deps'

export type JobNode = { id: string; name: string; archivedAt: Date | null; billableRateCents?: number | null }
export type ProjectNode = { id: string; name: string; archivedAt: Date | null; jobs: JobNode[] }
export type ClientNode = { id: string; name: string; archivedAt: Date | null; projects: ProjectNode[] }

function requireAdmin(ctx: SessionContext) {
  if (!isAdmin(ctx)) throw new HttpError(403, 'FORBIDDEN')
}

/** Tree of clients → projects → jobs. `billableRateCents` present only when canSeeMoney(ctx) (#5). */
export async function listStructure(
  deps: Deps,
  ctx: SessionContext,
  input: ListStructureInput,
): Promise<ClientNode[]> {
  const { db } = deps
  const showMoney = canSeeMoney(ctx)
  const clients = await db
    .select()
    .from(schema.clients)
    .where(input.includeArchived ? undefined : isNull(schema.clients.archivedAt))
    .all()
  const projects = await db
    .select()
    .from(schema.projects)
    .where(input.includeArchived ? undefined : isNull(schema.projects.archivedAt))
    .all()
  const jobs = await db
    .select()
    .from(schema.jobs)
    .where(input.includeArchived ? undefined : isNull(schema.jobs.archivedAt))
    .all()

  const projectsByClient = new Map<string, ProjectNode[]>()
  for (const p of projects) {
    const jobNodes: JobNode[] = jobs
      .filter((j) => j.projectId === p.id)
      .map((j) =>
        showMoney
          ? { id: j.id, name: j.name, archivedAt: j.archivedAt, billableRateCents: j.billableRateCents }
          : { id: j.id, name: j.name, archivedAt: j.archivedAt },
      )
    projectsByClient.set(p.clientId, [
      ...(projectsByClient.get(p.clientId) ?? []),
      { id: p.id, name: p.name, archivedAt: p.archivedAt, jobs: jobNodes },
    ])
  }

  return clients.map((c) => ({
    id: c.id,
    name: c.name,
    archivedAt: c.archivedAt,
    projects: projectsByClient.get(c.id) ?? [],
  }))
}

export async function createClient(deps: Deps, ctx: SessionContext, input: CreateClientInput): Promise<{ id: string }> {
  requireAdmin(ctx)
  const id = crypto.randomUUID()
  const now = deps.now()
  await deps.db.insert(schema.clients).values({ id, name: input.name, createdAt: now })
  return { id }
}

export async function updateClient(deps: Deps, ctx: SessionContext, input: UpdateClientInput): Promise<void> {
  requireAdmin(ctx)
  await deps.db.update(schema.clients).set({ name: input.name }).where(eq(schema.clients.id, input.id))
}

export async function archiveClient(deps: Deps, ctx: SessionContext, input: ArchiveInput): Promise<void> {
  requireAdmin(ctx)
  await deps.db
    .update(schema.clients)
    .set({ archivedAt: deps.now() })
    .where(and(eq(schema.clients.id, input.id), isNull(schema.clients.archivedAt)))
}

export async function createProject(deps: Deps, ctx: SessionContext, input: CreateProjectInput): Promise<{ id: string }> {
  requireAdmin(ctx)
  const id = crypto.randomUUID()
  const now = deps.now()
  await deps.db.insert(schema.projects).values({ id, clientId: input.clientId, name: input.name, createdAt: now })
  return { id }
}

export async function updateProject(deps: Deps, ctx: SessionContext, input: UpdateProjectInput): Promise<void> {
  requireAdmin(ctx)
  await deps.db.update(schema.projects).set({ name: input.name }).where(eq(schema.projects.id, input.id))
}

export async function archiveProject(deps: Deps, ctx: SessionContext, input: ArchiveInput): Promise<void> {
  requireAdmin(ctx)
  await deps.db
    .update(schema.projects)
    .set({ archivedAt: deps.now() })
    .where(and(eq(schema.projects.id, input.id), isNull(schema.projects.archivedAt)))
}

export async function createJob(deps: Deps, ctx: SessionContext, input: CreateJobInput): Promise<{ id: string }> {
  requireAdmin(ctx)
  const id = crypto.randomUUID()
  const now = deps.now()
  await deps.db.insert(schema.jobs).values({
    id,
    projectId: input.projectId,
    name: input.name,
    billableRateCents: input.billableRateCents,
    createdAt: now,
  })
  return { id }
}

/** Changing `billableRateCents` never touches existing intervals' `rate_cents` (#18). */
export async function updateJob(deps: Deps, ctx: SessionContext, input: UpdateJobInput): Promise<void> {
  requireAdmin(ctx)
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.billableRateCents !== undefined) patch.billableRateCents = input.billableRateCents
  if (Object.keys(patch).length === 0) return
  await deps.db.update(schema.jobs).set(patch).where(eq(schema.jobs.id, input.id))
}

export async function archiveJob(deps: Deps, ctx: SessionContext, input: ArchiveInput): Promise<void> {
  requireAdmin(ctx)
  await deps.db
    .update(schema.jobs)
    .set({ archivedAt: deps.now() })
    .where(and(eq(schema.jobs.id, input.id), isNull(schema.jobs.archivedAt)))
}
