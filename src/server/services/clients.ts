import { and, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import * as schema from '../../../drizzle/schema'
import { canSeeMoney, hasRole, isAdmin, type SessionContext } from '~/server/context'
import type {
  CreateContactInput,
  ListClientsInput,
  SetPrimaryContactInput,
  UpdateClientDetailsInput,
  UpdateContactInput,
} from '~/lib/schemas/clients'
import { likePattern, makeCursor, parseCursor } from '~/lib/search'
import { localDayBoundariesUtcMs } from '~/lib/dayMath'
import { HttpError } from '~/lib/errors'
import type { ProjectListRow } from './projects'
import { listProjects } from './projects'
import type { Deps } from './deps'

export type ClientListRow = {
  id: string
  name: string
  archivedAt: Date | null
  projectCount: number
  liveProjectCount: number
  effortMin: number
  lastActivityMs: number | null
  /** Money viewers only (#5); the key is omitted, never null. */
  billableCents?: number
}

export type Page<T> = { rows: T[]; nextCursor: string | null }

type SortKey = string | number | null

function scopeIds(ctx: SessionContext): string[] | undefined {
  // Billing sees everything; operators are scoped to self + supervisees (#10).
  return hasRole(ctx, 'billing') ? undefined : [ctx.workerId, ...ctx.superviseeWorkerIds]
}

function sortKeyFor(sort: 'name' | 'lastActivity' | 'effort', name: string, effortMin: number, lastActivityMs: number | null): SortKey {
  if (sort === 'lastActivity') return lastActivityMs
  if (sort === 'effort') return effortMin
  return name.toLowerCase()
}

function keyCmp(a: SortKey, b: SortKey): number {
  if (a === null && b === null) return 0
  if (a === null) return -1
  if (b === null) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

/** Keyset paging over in-memory merged rows; identical semantics to SQL `(sortKey, id)`. */
function page<T extends { sortKey: SortKey; id: string }>(
  rows: T[],
  input: { sort: 'name' | 'lastActivity' | 'effort'; cursor?: string; limit: number },
): Page<Omit<T, 'sortKey'>> {
  const sorted = rows.slice().sort((a, b) => keyCmp(a.sortKey, b.sortKey) || a.id.localeCompare(b.id))
  let start = 0
  if (input.cursor) {
    const { sortValue, id } = parseCursor(input.cursor)
    start = sorted.findIndex((r) => (keyCmp(r.sortKey, sortValue) || r.id.localeCompare(id)) > 0)
    if (start < 0) return { rows: [], nextCursor: null }
  }
  const out = sorted.slice(start, start + input.limit)
  const last = out[out.length - 1]
  const after = sorted.slice(start + input.limit)
  const nextCursor = after.length > 0 && last ? makeCursor(last.sortKey, last.id) : null
  return { rows: out.map(({ sortKey: _k, ...rest }) => rest), nextCursor }
}

export async function listClients(deps: Deps, ctx: SessionContext, input: ListClientsInput): Promise<Page<ClientListRow>> {
  const { db } = deps

  const eConds = []
  if (input.status === 'active') eConds.push(isNull(schema.clients.archivedAt))
  if (input.status === 'archived') eConds.push(isNotNull(schema.clients.archivedAt))
  if (input.q) {
    const pat = likePattern(input.q.toLowerCase())
    eConds.push(
      sql`(lower(${schema.clients.name}) LIKE ${pat} ESCAPE '\\' OR EXISTS (
        SELECT 1 FROM ${schema.clientContacts} cc
        WHERE cc.client_id = ${schema.clients.id} AND cc.archived_at IS NULL
          AND (lower(cc.name) LIKE ${pat} ESCAPE '\\' OR lower(cc.email) LIKE ${pat} ESCAPE '\\')
      ))`,
    )
  }

  const ivConds = [isNull(schema.intervals.deletedAt)]
  const workers = scopeIds(ctx)
  if (workers) ivConds.push(inArray(schema.intervals.workerId, workers))
  if (input.activeSince) {
    const { startMs } = localDayBoundariesUtcMs(input.activeSince, deps.tz)
    ivConds.push(gt(schema.intervals.startedAt, new Date(startMs)))
  }

  const [entities, projectsAgg, intervalsAgg] = await Promise.all([
    db
      .select({ id: schema.clients.id, name: schema.clients.name, archivedAt: schema.clients.archivedAt })
      .from(schema.clients)
      .where(and(...eConds))
      .all(),
    db
      .select({
        clientId: schema.projects.clientId,
        total: sql<number>`count(*)`,
        live: sql<number>`sum(case when ${schema.projects.archivedAt} is null then 1 else 0 end)`,
      })
      .from(schema.projects)
      .groupBy(schema.projects.clientId)
      .all(),
    db
      .select({
        clientId: schema.projects.clientId,
        effort: sql<number>`sum((${schema.intervals.endedAt} - ${schema.intervals.startedAt}) / 60000.0)`,
        lastMs: sql<number | null>`max(${schema.intervals.startedAt})`,
        minuteCents: sql<number>`sum(((${schema.intervals.endedAt} - ${schema.intervals.startedAt}) / 60000.0) * coalesce(${schema.intervals.rateCents}, 0))`,
      })
      .from(schema.intervals)
      .innerJoin(schema.jobs, eq(schema.jobs.id, schema.intervals.jobId))
      .innerJoin(schema.projects, eq(schema.projects.id, schema.jobs.projectId))
      .where(and(...ivConds))
      .groupBy(schema.projects.clientId)
      .all(),
  ])

  const projMap = new Map(projectsAgg.map((r) => [r.clientId, r]))
  const ivMap = new Map(intervalsAgg.map((r) => [r.clientId, r]))
  const keepCents = canSeeMoney(ctx)

  const merged = entities.map((e) => {
    const iv = ivMap.get(e.id)
    // activeSince: a client with no qualifying interval drops to no activity — and
    // must be filtered out when activeSince is set.
    const effortMin = iv ? Math.round(Number(iv.effort)) : 0
    const lastActivityMs = iv && iv.lastMs != null ? Number(iv.lastMs) : null
    const row: ClientListRow & { sortKey: SortKey } = {
      id: e.id,
      name: e.name,
      archivedAt: e.archivedAt,
      projectCount: Number(projMap.get(e.id)?.total ?? 0),
      liveProjectCount: Number(projMap.get(e.id)?.live ?? 0),
      effortMin,
      lastActivityMs,
      sortKey: sortKeyFor(input.sort, e.name, effortMin, lastActivityMs),
    }
    if (keepCents && iv) row.billableCents = Math.round(Number(iv.minuteCents) / 60)
    return row
  })

  const filtered = input.activeSince ? merged.filter((r) => r.lastActivityMs != null) : merged
  return page(filtered, input)
}

// ---- Detail + contact writes (Wave 2) ----

export type ContactView = {
  id: string
  clientId: string
  name: string
  role: string | null
  email: string | null
  phone: string | null
  isPrimary: boolean
  notes: string | null
}

export type ClientDetail = ClientListRow & {
  email: string | null
  phone: string | null
  website: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  region: string | null
  postcode: string | null
  country: string | null
  notes: string | null
  contacts: ContactView[]
  projects: ProjectListRow[]
}

export async function getClient(deps: Deps, ctx: SessionContext, input: { id: string }): Promise<ClientDetail> {
  const list = await listClients(deps, ctx, { status: 'all', sort: 'name', limit: 200 })
  const row = list.rows.find((r) => r.id === input.id)
  if (!row) throw new HttpError(404, 'NOT_FOUND')
  const [detail, contacts, projects] = await Promise.all([
    deps.db.select().from(schema.clients).where(eq(schema.clients.id, input.id)).get(),
    deps.db
      .select({
        id: schema.clientContacts.id,
        clientId: schema.clientContacts.clientId,
        name: schema.clientContacts.name,
        role: schema.clientContacts.role,
        email: schema.clientContacts.email,
        phone: schema.clientContacts.phone,
        isPrimary: schema.clientContacts.isPrimary,
        notes: schema.clientContacts.notes,
      })
      .from(schema.clientContacts)
      .where(and(eq(schema.clientContacts.clientId, input.id), isNull(schema.clientContacts.archivedAt)))
      .all(),
    listProjects(deps, ctx, { clientId: input.id, status: 'all', sort: 'name', limit: 200, due: 'any' }),
  ])
  if (!detail) throw new HttpError(404, 'NOT_FOUND')
  contacts.sort((a, b) => (a.isPrimary === b.isPrimary ? a.name.localeCompare(b.name) : a.isPrimary ? -1 : 1))
  return {
    ...row,
    email: detail.email,
    phone: detail.phone,
    website: detail.website,
    addressLine1: detail.addressLine1,
    addressLine2: detail.addressLine2,
    city: detail.city,
    region: detail.region,
    postcode: detail.postcode,
    country: detail.country,
    notes: detail.notes,
    contacts,
    projects: projects.rows,
  }
}

export async function updateClientDetails(
  deps: Deps,
  ctx: SessionContext,
  input: UpdateClientDetailsInput,
): Promise<ClientDetail> {
  if (!isAdmin(ctx)) throw new HttpError(403, 'FORBIDDEN')
  const { id, ...fields } = input
  await deps.db.update(schema.clients).set(fields).where(eq(schema.clients.id, id))
  return getClient(deps, ctx, { id })
}

function contactPatch(input: { name?: string; role?: string | null; email?: string | null; phone?: string | null; notes?: string | null }) {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.role !== undefined ? { role: input.role } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  }
}

export async function createContact(deps: Deps, ctx: SessionContext, input: CreateContactInput): Promise<ContactView> {
  if (!isAdmin(ctx)) throw new HttpError(403, 'FORBIDDEN')
  const client = await deps.db.select({ id: schema.clients.id }).from(schema.clients).where(eq(schema.clients.id, input.clientId)).get()
  if (!client) throw new HttpError(404, 'NOT_FOUND')
  const id = `cc-${crypto.randomUUID()}`
  await deps.db.insert(schema.clientContacts).values({
    id,
    clientId: input.clientId,
    name: input.name,
    role: input.role ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    notes: input.notes ?? null,
    isPrimary: false,
    createdAt: deps.now(),
  })
  return { id, clientId: input.clientId, name: input.name, role: input.role ?? null, email: input.email ?? null, phone: input.phone ?? null, isPrimary: false, notes: input.notes ?? null }
}

export async function updateContact(deps: Deps, ctx: SessionContext, input: UpdateContactInput): Promise<ContactView> {
  if (!isAdmin(ctx)) throw new HttpError(403, 'FORBIDDEN')
  await deps.db
    .update(schema.clientContacts)
    .set({ ...contactPatch(input), updatedAt: deps.now() })
    .where(eq(schema.clientContacts.id, input.id))
  const row = await deps.db.select().from(schema.clientContacts).where(eq(schema.clientContacts.id, input.id)).get()
  if (!row) throw new HttpError(404, 'CONTACT_NOT_FOUND', 'id')
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    role: row.role,
    email: row.email,
    phone: row.phone,
    isPrimary: row.isPrimary,
    notes: row.notes,
  }
}

export async function archiveContact(deps: Deps, ctx: SessionContext, input: { id: string }): Promise<void> {
  if (!isAdmin(ctx)) throw new HttpError(403, 'FORBIDDEN')
  await deps.db
    .update(schema.clientContacts)
    .set({ archivedAt: deps.now(), updatedAt: deps.now() })
    .where(eq(schema.clientContacts.id, input.id))
}

export async function setPrimaryContact(deps: Deps, ctx: SessionContext, input: SetPrimaryContactInput): Promise<void> {
  if (!isAdmin(ctx)) throw new HttpError(403, 'FORBIDDEN')
  const now = deps.now()
  deps.db.batch([
    deps.db
      .update(schema.clientContacts)
      .set({ isPrimary: false, updatedAt: now })
      .where(and(eq(schema.clientContacts.clientId, input.clientId), isNotNull(schema.clientContacts.isPrimary))),
    deps.db
      .update(schema.clientContacts)
      .set({ isPrimary: true, updatedAt: now })
      .where(eq(schema.clientContacts.id, input.id)),
  ])
}
