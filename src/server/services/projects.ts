import { and, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { HttpError } from '~/lib/errors'
import * as schema from '../../../drizzle/schema'
import { canSeeMoney, hasRole, type SessionContext } from '~/server/context'
import type { ListProjectsInput } from '~/lib/schemas/projects'
import { likePattern, makeCursor, parseCursor } from '~/lib/search'
import { localDayBoundariesUtcMs } from '~/lib/dayMath'
import { isoWeekStart, weekDates } from '~/lib/week'
import { recon as piecesRecon } from '~/lib/attribution'
import { overtimeByProject, totalOvertimeMin } from '~/lib/overtime'
import { loadPieces, type RoleRecon, type TimeRecon } from './reports'
import type { JobNode } from './structure'
import { listAssignments } from './assignments'
import { getOrgSettings } from './settings'
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

type RowsInput = Omit<ListProjectsInput, 'cursor' | 'limit'>

export async function listProjects(deps: Deps, ctx: SessionContext, input: ListProjectsInput): Promise<Page<ProjectListRow>> {
  return page(await projectRows(deps, ctx, input), input)
}

/** Every matching row, sorted, unpaged — for detail pages that must not stop at a page limit. */
export async function allProjects(deps: Deps, ctx: SessionContext, input: RowsInput): Promise<ProjectListRow[]> {
  const rows = await projectRows(deps, ctx, input)
  return page(rows, { sort: input.sort, limit: rows.length }).rows
}

async function projectRows(
  deps: Deps,
  ctx: SessionContext,
  input: RowsInput,
  onlyId?: string,
): Promise<(ProjectListRow & { sortKey: SortKey })[]> {
  const { db } = deps

  const eConds = []
  if (onlyId) eConds.push(eq(schema.projects.id, onlyId))
  if (input.status === 'active') eConds.push(isNull(schema.projects.archivedAt))
  if (input.status === 'archived') eConds.push(isNotNull(schema.projects.archivedAt))
  if (input.clientId) eConds.push(eq(schema.projects.clientId, input.clientId))
  if (input.q) {
    eConds.push(sql`lower(${schema.projects.name}) LIKE ${likePattern(input.q.toLowerCase())} ESCAPE '\\'`)
  }

  const ivConds = [isNull(schema.intervals.deletedAt)]
  if (onlyId) ivConds.push(eq(schema.jobs.projectId, onlyId))
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

  return input.activeSince ? merged.filter((r) => r.lastActivityMs != null) : merged
}

export type ProjectDetail = ProjectListRow & { client: { id: string; name: string }; jobs: JobNode[] }

export type ProjectFigures = {
  period: RoleRecon
  allTime: RoleRecon
  overtimeMin: number
  byJob: { jobId: string; jobName: string; archivedAt: Date | null; billableRateCents?: number | null; period: RoleRecon }[]
  byWorker: { workerId: string; name: string; kind: 'human' | 'agent'; period: RoleRecon; overtimeMin: number }[]
  weeks: { weekStart: string; recon: RoleRecon; overtimeMin: number }[]
  recent: { id: string; workerName: string; jobName: string; startedAt: Date; endedAt: Date }[]
  budgetCents?: number | null
  consumedCents?: number
  dueOn?: string | null
  assigned?: { workerId: string; name: string; allocatedMinutes: number | null }[]
}

function reconLiteral(r: ReturnType<typeof piecesRecon>, keepCents: boolean): RoleRecon {
  if (keepCents) return r
  const { cents: _drop, ...rest } = r
  return rest as TimeRecon
}

async function workerNamesFor(db: Deps['db']): Promise<Map<string, { name: string; kind: 'human' | 'agent' }>> {
  const rows = await db
    .select({ workerId: schema.workers.id, userName: schema.user.name, workerName: schema.workers.name, kind: schema.workers.kind })
    .from(schema.workers)
    .leftJoin(schema.humanWorkers, eq(schema.humanWorkers.workerId, schema.workers.id))
    .leftJoin(schema.user, eq(schema.user.id, schema.humanWorkers.userId))
    .all()
  const out = new Map<string, { name: string; kind: 'human' | 'agent' }>()
  for (const r of rows) out.set(r.workerId, { name: r.userName ?? r.workerName ?? r.workerId, kind: r.kind })
  return out
}

const ALL = { from: '2000-01-01', to: '2100-01-01' }

/** Detail panel for the project page; money keys follow the structure tree gates. */
export async function getProject(deps: Deps, ctx: SessionContext, input: { id: string }): Promise<ProjectDetail> {
  const keepCents = canSeeMoney(ctx)
  const rows = await deps.db
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
    .where(eq(schema.projects.id, input.id))
    .get()
  if (!rows) throw new HttpError(404, 'NOT_FOUND')
  const jobs = await deps.db
    .select({
      id: schema.jobs.id,
      name: schema.jobs.name,
      archivedAt: schema.jobs.archivedAt,
      dueOn: schema.jobs.dueOn,
      billableRateCents: schema.jobs.billableRateCents,
      budgetCents: schema.jobs.budgetCents,
    })
    .from(schema.jobs)
    .where(eq(schema.jobs.projectId, input.id))
    .all()
  // jobCount/liveJobCount/effortMin come along via the list row contract, but the
  // detail page only needs identity + jobs, so compute counts inline.
  const [jobCount, liveJobCount] = [jobs.length, jobs.filter((j) => !j.archivedAt).length]
  void jobCount
  const effortMin = await effortForProject(deps, ctx, input.id)
  return {
    id: rows.id,
    name: rows.name,
    archivedAt: rows.archivedAt,
    clientId: rows.clientId,
    clientName: rows.clientName,
    jobCount,
    liveJobCount,
    effortMin,
    lastActivityMs: null,
    dueOn: rows.dueOn,
    client: { id: rows.clientId, name: rows.clientName },
    jobs: jobs.map((j) => ({
      id: j.id,
      name: j.name,
      archivedAt: j.archivedAt,
      dueOn: j.dueOn,
      ...(keepCents ? { billableRateCents: j.billableRateCents, budgetCents: j.budgetCents } : {}),
    })),
  }
}

async function effortForProject(deps: Deps, ctx: SessionContext, projectId: string): Promise<number> {
  const [row] = await projectRows(deps, ctx, { status: 'all', sort: 'name', due: 'any' }, projectId)
  return row?.effortMin ?? 0
}

/** Figures + overtime for the project page; `from`/`to` omitted = all time. */
export async function projectFigures(
  deps: Deps,
  ctx: SessionContext,
  input: { id: string; from?: string; to?: string },
): Promise<ProjectFigures> {
  const keepCents = canSeeMoney(ctx)
  const scope = hasRole(ctx, 'billing') ? {} : { workerIds: [ctx.workerId, ...ctx.superviseeWorkerIds] }
  const filteredPeriod = input.from !== undefined || input.to !== undefined
  const period = filteredPeriod ? { from: input.from ?? ALL.from, to: input.to ?? ALL.to } : ALL

  const detail = await getProject(deps, ctx, input)
  const jobIds = detail.jobs.map((j) => j.id)

  const [periodPieces, allPieces, settings, assignments, names] = await Promise.all([
    loadPieces(deps, period, { projectId: input.id, ...scope }),
    loadPieces(deps, ALL, { projectId: input.id, ...scope }),
    getOrgSettings(deps, ctx),
    listAssignments(deps, ctx, {}),
    workerNamesFor(deps.db),
  ])
  // Overtime needs ALL of the worker's pieces for the period, not just this project's (#overtime).
  const workerIds = [...new Set(allPieces.map((p) => p.workerId))]
  const widePieces = workerIds.length ? await loadPieces(deps, period, { workerIds, ...scope }) : []
  const overtimeRows = overtimeByProject(widePieces, new Set(jobIds), settings.defaultDayMinutes)

  const byJob = detail.jobs.map((j) => {
    const jp = periodPieces.filter((p) => p.jobId === j.id)
    const ot = overtimeByProject(widePieces, new Set([j.id]), settings.defaultDayMinutes)
    return {
      jobId: j.id,
      jobName: j.name,
      archivedAt: j.archivedAt,
      period: reconLiteral(piecesRecon(jp), keepCents),
      ...(keepCents ? { billableRateCents: j.billableRateCents ?? null } : {}),
      ...(ot.length > 0 ? { overtimeMin: totalOvertimeMin(ot) } : {}),
    }
  })

  const byWorker = workerIds.map((workerId) => {
    const ot = overtimeRows.filter((o) => o.workerId === workerId)
    const meta = names.get(workerId)
    return {
      workerId,
      name: meta?.name ?? workerId,
      kind: meta?.kind ?? 'human',
      period: reconLiteral(piecesRecon(periodPieces.filter((p) => p.workerId === workerId)), keepCents),
      overtimeMin: totalOvertimeMin(ot),
    }
  })

  const weeks: { weekStart: string; recon: RoleRecon; overtimeMin: number }[] = []
  if (periodPieces.length > 0) {
    const endMs = localDayBoundariesUtcMs(period.to, deps.tz).endMs
    let weekStart = isoWeekStart(localDayBoundariesUtcMs(period.from, deps.tz).startMs, deps.tz)
    for (;;) {
      const dates = weekDates(weekStart)
      const inWeek = periodPieces.filter((p) => dates.includes(p.day))
      const isLast = localDayBoundariesUtcMs(dates[6]!, deps.tz).endMs >= endMs
      if (inWeek.length > 0) {
        const ot = overtimeRows.filter((o) => dates.includes(o.day))
        weeks.push({
          weekStart: dates[0]!,
          recon: reconLiteral(piecesRecon(inWeek), keepCents),
          overtimeMin: totalOvertimeMin(ot),
        })
      }
      if (isLast) break
      const [y, m, d] = dates[6]!.split('-').map(Number) as [number, number, number]
      weekStart = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
    }
  }

  const recent = await recentForProject(deps, ctx, input.id)

  const out: ProjectFigures = {
    period: reconLiteral(piecesRecon(periodPieces), keepCents),
    allTime: reconLiteral(piecesRecon(allPieces), keepCents),
    overtimeMin: totalOvertimeMin(overtimeRows),
    byJob,
    byWorker,
    weeks,
    recent,
    dueOn: detail.dueOn ?? null,
    assigned: assignments
      .filter((a) => a.projectId === input.id)
      .map((a) => ({ workerId: a.workerId, name: a.workerName, allocatedMinutes: a.allocatedMinutes })),
  }
  if (keepCents) {
    const all = reconLiteral(piecesRecon(allPieces), true)
    out.consumedCents = (all as { cents: number }).cents
    if (detail.jobs.some((j) => 'budgetCents' in j && j.budgetCents != null)) {
      out.budgetCents = detail.jobs.reduce((s, j) => s + (('budgetCents' in j && j.budgetCents) || 0), 0)
    }
  }
  return out
}

async function recentForProject(deps: Deps, ctx: SessionContext, projectId: string) {
  const workers = scopeIds(ctx)
  const conds = [eq(schema.jobs.projectId, projectId), isNull(schema.intervals.deletedAt)]
  if (workers) conds.push(inArray(schema.intervals.workerId, workers))
  const rows = await deps.db
    .select({
      id: schema.intervals.id,
      workerId: schema.intervals.workerId,
      jobName: schema.jobs.name,
      startedAt: schema.intervals.startedAt,
      endedAt: schema.intervals.endedAt,
    })
    .from(schema.intervals)
    .innerJoin(schema.jobs, eq(schema.jobs.id, schema.intervals.jobId))
    .where(and(...conds))
    .orderBy(sql`${schema.intervals.startedAt} desc`)
    .limit(20)
    .all()
  const names = await workerNamesFor(deps.db)
  return rows.map((r) => ({
    id: r.id,
    workerName: names.get(r.workerId)?.name ?? '',
    jobName: r.jobName,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
  }))
}
