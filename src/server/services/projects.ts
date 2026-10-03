import { and, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import * as schema from '../../../drizzle/schema'
import { canSeeMoney, hasRole, type SessionContext } from '~/server/context'
import type { ListProjectsInput } from '~/lib/schemas/projects'
import { likePattern, makeCursor, parseCursor } from '~/lib/search'
import { localDayBoundariesUtcMs } from '~/lib/dayMath'
import type { Deps } from './deps'

export type ProjectListRow = {
  id: string
  name: string
  archivedAt: Date | null
  clientId: string
  clientName: string
  jobCount: number
  liveJobCount: number
  effortMin: number
  lastActivityMs: number | null
  dueOn?: string | null // assignments plan landed; always set on this shape
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

export async function listProjects(deps: Deps, ctx: SessionContext, input: ListProjectsInput): Promise<Page<ProjectListRow>> {
  const { db } = deps

  const eConds = []
  if (input.status === 'active') eConds.push(isNull(schema.projects.archivedAt))
  if (input.status === 'archived') eConds.push(isNotNull(schema.projects.archivedAt))
  if (input.clientId) eConds.push(eq(schema.projects.clientId, input.clientId))
  if (input.q) {
    eConds.push(sql`lower(${schema.projects.name}) LIKE ${likePattern(input.q.toLowerCase())} ESCAPE '\\'`)
  }

  const ivConds = [isNull(schema.intervals.deletedAt)]
  const workers = scopeIds(ctx)
  if (workers) ivConds.push(inArray(schema.intervals.workerId, workers))
  if (input.activeSince) {
    const { startMs } = localDayBoundariesUtcMs(input.activeSince, deps.tz)
    ivConds.push(gt(schema.intervals.startedAt, new Date(startMs)))
  }

  const [entities, jobsAgg, intervalsAgg] = await Promise.all([
    db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        archivedAt: schema.projects.archivedAt,
        clientId: schema.projects.clientId,
        clientName: schema.clients.name,
        dueOn: schema.projects.dueOn,
      })
      .from(schema.projects)
      .innerJoin(schema.clients, eq(schema.clients.id, schema.projects.clientId))
      .where(and(...eConds))
      .all(),
    db
      .select({
        projectId: schema.jobs.projectId,
        total: sql<number>`count(*)`,
        live: sql<number>`sum(case when ${schema.jobs.archivedAt} is null then 1 else 0 end)`,
      })
      .from(schema.jobs)
      .groupBy(schema.jobs.projectId)
      .all(),
    db
      .select({
        projectId: schema.jobs.projectId,
        effort: sql<number>`sum((${schema.intervals.endedAt} - ${schema.intervals.startedAt}) / 60000.0)`,
        lastMs: sql<number | null>`max(${schema.intervals.startedAt})`,
        minuteCents: sql<number>`sum(((${schema.intervals.endedAt} - ${schema.intervals.startedAt}) / 60000.0) * coalesce(${schema.intervals.rateCents}, 0))`,
      })
      .from(schema.intervals)
      .innerJoin(schema.jobs, eq(schema.jobs.id, schema.intervals.jobId))
      .where(and(...ivConds))
      .groupBy(schema.jobs.projectId)
      .all(),
  ])

  const jobMap = new Map(jobsAgg.map((r) => [r.projectId, r]))
  const ivMap = new Map(intervalsAgg.map((r) => [r.projectId, r]))
  const keepCents = canSeeMoney(ctx)

  const merged = entities.map((e) => {
    const iv = ivMap.get(e.id)
    const effortMin = iv ? Math.round(Number(iv.effort)) : 0
    const lastActivityMs = iv && iv.lastMs != null ? Number(iv.lastMs) : null
    const row: ProjectListRow & { sortKey: SortKey } = {
      id: e.id,
      name: e.name,
      archivedAt: e.archivedAt,
      clientId: e.clientId,
      clientName: e.clientName,
      jobCount: Number(jobMap.get(e.id)?.total ?? 0),
      liveJobCount: Number(jobMap.get(e.id)?.live ?? 0),
      effortMin,
      lastActivityMs,
      dueOn: e.dueOn,
      sortKey: sortKeyFor(input.sort, e.name, effortMin, lastActivityMs),
    }
    if (keepCents && iv) row.billableCents = Math.round(Number(iv.minuteCents) / 60)
    return row
  })

  const filtered = input.activeSince ? merged.filter((r) => r.lastActivityMs != null) : merged
  return page(filtered, input)
}
