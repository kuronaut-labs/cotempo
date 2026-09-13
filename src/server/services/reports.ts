import { and, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm'
import {
  clipPieces,
  explode,
  groupBy,
  recon,
  type Piece,
  type Recon,
} from '~/lib/attribution'
import { localDayBoundariesUtcMs } from '~/lib/dayMath'
import { HttpError } from '~/lib/errors'
import { canSeeMoney, hasRole, type SessionContext } from '~/server/context'
import { schema, type Db } from '~/server/db'
import type { KpiInput, PeriodInput } from '~/lib/schemas/reports'
import type { Deps } from './deps'

/** Recon without money, for operators (#5). */
export type TimeRecon = Omit<Recon, 'cents'>
/** `cents` present only when canSeeMoney(ctx). Never send the key to an operator. */
export type RoleRecon = Recon | TimeRecon

export type ClientRecon = { clientId: string; name: string } & RoleRecon
export type ReconciliationReport = { clients: ClientRecon[]; total: RoleRecon }

export type DailyReport = {
  days: string[]
  clients: { id: string; name: string }[]
  cells: Record<string, Record<string, RoleRecon>> // day → clientId → recon
  totals: { byDay: Record<string, RoleRecon>; byClient: Record<string, ClientRecon>; all: RoleRecon }
}

export type OperatorLane = {
  workerId: string
  name: string
  kind: 'human' | 'agent'
  total: TimeRecon
  days: { day: string; trio: TimeRecon; pieces: { startMs: number; endMs: number; jobId: string }[] }[]
}

export type AdminKpis = {
  date: string
  workers: { humans: number; agents: number }
  structure: { clients: number; projects: number; jobs: number }
  todayBillableCents: number
  todayPremiumMin: number
  utilization: number // Σ wall-clock / (active humans × 8h), 0..1+
  perWorker: { workerId: string; name: string; wallClockMin: number; utilization: number }[]
  effortSeries: { hour: number; effortMin: number; wallClockMin: number }[]
}

export type JobRecon = { jobId: string; jobName: string; projectName: string; clientName: string } & RoleRecon

/* Build a `RoleRecon` literal: with `cents` when the viewer may see money, without
   the key when not. Stripping the key, not setting it to null, is the contract (#5). */
function makeRecon(r: Recon, keepCents: boolean): RoleRecon {
  if (keepCents) return r
  const { cents: _drop, ...rest } = r
  return rest as TimeRecon
}

function periodRange(period: PeriodInput, tz: string) {
  return {
    startMs: localDayBoundariesUtcMs(period.from, tz).startMs,
    endMs: localDayBoundariesUtcMs(period.to, tz).endMs,
  }
}

async function loadIntervalsInRange(
  db: Db,
  startMs: number,
  endMs: number,
  filter: { workerIds?: string[]; clientId?: string } = {},
) {
  const conds = [
    isNull(schema.intervals.deletedAt),
    lt(schema.intervals.startedAt, new Date(endMs)),
    gt(schema.intervals.endedAt, new Date(startMs)),
  ]
  if (filter.workerIds && filter.workerIds.length > 0) conds.push(inArray(schema.intervals.workerId, filter.workerIds))
  if (filter.clientId) {
    // Archived jobs keep their historical time everywhere — archiving stops
    // *new* entries (guarded at interval create) but billing for past work
    // stays. The previous filter dropped the time from invoice/client views
    // while keeping it in reconciliation, exports, and operator lanes, so
    // totals disagreed. (#H5)
    const jobIds = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.jobs.projectId))
      .where(eq(schema.projects.clientId, filter.clientId))
      .all()
    if (jobIds.length === 0) return []
    conds.push(inArray(schema.intervals.jobId, jobIds.map((j) => j.id)))
  }
  return db
    .select({
      id: schema.intervals.id,
      workerId: schema.intervals.workerId,
      jobId: schema.intervals.jobId,
      rateCents: schema.intervals.rateCents,
      startedAt: schema.intervals.startedAt,
      endedAt: schema.intervals.endedAt,
      clientId: schema.projects.clientId,
    })
    .from(schema.intervals)
    .innerJoin(schema.jobs, eq(schema.jobs.id, schema.intervals.jobId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.jobs.projectId))
    .where(and(...conds))
    .all()
}

async function clientNameMap(db: Db, clientIds: string[]): Promise<Map<string, string>> {
  if (clientIds.length === 0) return new Map()
  const rows = await db
    .select({ id: schema.clients.id, name: schema.clients.name })
    .from(schema.clients)
    .where(inArray(schema.clients.id, clientIds))
    .all()
  return new Map(rows.map((r) => [r.id, r.name]))
}

/** Intervals intersecting [start(from), end(to)) in org tz, joined to job→project→client, exploded and trimmed. */
export async function loadPieces(
  deps: Deps,
  period: PeriodInput,
  filter: { workerIds?: string[]; clientId?: string } = {},
): Promise<Piece[]> {
  const { db, tz } = deps
  const { startMs, endMs } = periodRange(period, tz)
  const rows = await loadIntervalsInRange(db, startMs, endMs, filter)
  const all: Piece[] = []
  for (const r of rows) {
    const pieces = explode(
      {
        id: r.id,
        workerId: r.workerId,
        jobId: r.jobId,
        clientId: r.clientId,
        startMs: r.startedAt.getTime(),
        endMs: r.endedAt.getTime(),
        rateCents: r.rateCents,
      },
      tz,
    )
    for (const p of clipPieces(pieces, startMs, endMs, tz)) all.push(p)
  }
  return all
}

function scopeFor(ctx: SessionContext): { workerIds?: string[] } {
  return hasRole(ctx, 'billing') ? {} : { workerIds: [ctx.workerId, ...ctx.superviseeWorkerIds] }
}

export async function reconciliation(deps: Deps, ctx: SessionContext, input: PeriodInput): Promise<ReconciliationReport> {
  const { db } = deps
  const pieces = await loadPieces(deps, input, scopeFor(ctx))
  const byClient = groupBy(pieces, 'clientId')
  const names = await clientNameMap(db, [...byClient.keys()])

  const keepCents = canSeeMoney(ctx)
  const clients: ClientRecon[] = [...byClient.keys()]
    .sort()
    .map((clientId) => {
      const r = recon(byClient.get(clientId)!)
      return { clientId, name: names.get(clientId) ?? '?', ...makeRecon(r, keepCents) }
    })

  const totalR = recon(pieces)
  return { clients, total: makeRecon(totalR, keepCents) }
}

export async function daily(deps: Deps, ctx: SessionContext, input: PeriodInput): Promise<DailyReport> {
  const { db } = deps
  const pieces = await loadPieces(deps, input, scopeFor(ctx))

  const byDay = groupBy(pieces, 'day')
  const byClient = groupBy(pieces, 'clientId')
  const names = await clientNameMap(db, [...byClient.keys()])

  const keepCents = canSeeMoney(ctx)
  const cells: Record<string, Record<string, RoleRecon>> = {}
  for (const day of [...byDay.keys()].sort()) {
    cells[day] = {}
    const dayByClient = groupBy(byDay.get(day)!, 'clientId')
    for (const [clientId, dayClientPieces] of dayByClient) {
      cells[day]![clientId] = makeRecon(recon(dayClientPieces), keepCents)
    }
  }

  const byDayTotals: Record<string, RoleRecon> = {}
  for (const [day, dayPieces] of byDay) byDayTotals[day] = makeRecon(recon(dayPieces), keepCents)
  const byClientTotals: Record<string, ClientRecon> = {}
  for (const [clientId, clientPieces] of byClient) {
    byClientTotals[clientId] = {
      clientId,
      name: names.get(clientId) ?? '?',
      ...makeRecon(recon(clientPieces), keepCents),
    }
  }
  const allR = recon(pieces)

  return {
    days: [...byDay.keys()].sort(),
    clients: [...byClient.keys()].sort().map((id) => ({ id, name: names.get(id) ?? '?' })),
    cells,
    totals: { byDay: byDayTotals, byClient: byClientTotals, all: makeRecon(allR, keepCents) },
  }
}

export async function operatorLanes(deps: Deps, ctx: SessionContext, input: PeriodInput): Promise<OperatorLane[]> {
  const { db } = deps
  const pieces = await loadPieces(deps, input, scopeFor(ctx))
  const byWorker = groupBy(pieces, 'workerId')
  const workerIds = [...byWorker.keys()]
  if (workerIds.length === 0) return []

  const workerRows = await db
    .select({ id: schema.workers.id, kind: schema.workers.kind, name: schema.workers.name })
    .from(schema.workers)
    .where(inArray(schema.workers.id, workerIds))
    .all()
  const workerMap = new Map(workerRows.map((w) => [w.id, w]))

  const humanIds = workerRows.filter((w) => w.kind === 'human').map((w) => w.id)
  const userNames = new Map<string, string>()
  if (humanIds.length > 0) {
    const rows = await db
      .select({ workerId: schema.humanWorkers.workerId, name: schema.user.name })
      .from(schema.humanWorkers)
      .innerJoin(schema.user, eq(schema.user.id, schema.humanWorkers.userId))
      .where(inArray(schema.humanWorkers.workerId, humanIds))
      .all()
    for (const r of rows) userNames.set(r.workerId, r.name)
  }

  const lanes: OperatorLane[] = []
  for (const [workerId, workerPieces] of byWorker) {
    const w = workerMap.get(workerId)
    if (!w) continue
    const name = w.kind === 'human' ? userNames.get(workerId) ?? '?' : w.name ?? '?'

    const laneByDay = groupBy(workerPieces, 'day')
    const totalR = recon(workerPieces)
    const days = [...laneByDay.keys()]
      .sort()
      .map((day) => {
        const dayPieces = laneByDay.get(day)!
        return {
          day,
          trio: makeRecon(recon(dayPieces), false) as TimeRecon,
          pieces: dayPieces.map((p) => ({ startMs: p.startMs, endMs: p.endMs, jobId: p.jobId })),
        }
      })
    lanes.push({
      workerId,
      name,
      kind: w.kind,
      total: makeRecon(totalR, false) as TimeRecon,
      days,
    })
  }
  return lanes.sort((a, b) => a.name.localeCompare(b.name))
}

export async function adminKpis(deps: Deps, ctx: SessionContext, input: KpiInput): Promise<AdminKpis> {
  if (!canSeeMoney(ctx)) throw new HttpError(403, 'FORBIDDEN')
  const { db, tz } = deps

  const allWorkers = await db
    .select({ id: schema.workers.id, kind: schema.workers.kind })
    .from(schema.workers)
    .where(isNull(schema.workers.archivedAt))
    .all()
  const humans = allWorkers.filter((w) => w.kind === 'human').length
  const agents = allWorkers.filter((w) => w.kind === 'agent').length

  const clientCount = await db.select({ c: sql<number>`count(*)` }).from(schema.clients).where(isNull(schema.clients.archivedAt)).get()
  const projectCount = await db.select({ c: sql<number>`count(*)` }).from(schema.projects).where(isNull(schema.projects.archivedAt)).get()
  const jobCount = await db.select({ c: sql<number>`count(*)` }).from(schema.jobs).where(isNull(schema.jobs.archivedAt)).get()

  const dayPieces = await loadPieces(deps, { from: input.date, to: input.date })
  const dayR = recon(dayPieces)
  const dayStart = localDayBoundariesUtcMs(input.date, tz).startMs

  const byWorker = groupBy(dayPieces, 'workerId')
  const workerIds = [...byWorker.keys()]
  const humanNames = workerIds.length
    ? await db
        .select({ workerId: schema.humanWorkers.workerId, name: schema.user.name })
        .from(schema.humanWorkers)
        .innerJoin(schema.user, eq(schema.user.id, schema.humanWorkers.userId))
        .where(inArray(schema.humanWorkers.workerId, workerIds))
        .all()
    : []
  const nameMap = new Map(humanNames.map((u) => [u.workerId, u.name]))

  const dayMinutes = 8 * 60
  const perWorker = workerIds.map((workerId) => {
    const r = recon(byWorker.get(workerId)!)
    return {
      workerId,
      name: nameMap.get(workerId) ?? '?',
      wallClockMin: r.wallClockMin,
      // Per-worker denominator is a single 8h day, not the org-wide headcount
      // × 8h. The aggregate `utilization` below keeps the org-wide form. (#M1)
      utilization: r.wallClockMin / dayMinutes,
    }
  })

  const effortSeries: { hour: number; effortMin: number; wallClockMin: number }[] = []
  for (let h = 0; h < 24; h++) {
    const hourStart = dayStart + h * 3_600_000
    const hourEnd = hourStart + 3_600_000
    // Clip pieces to [hourStart, hourEnd) before recon — otherwise a 2h
    // interval contributes 120min to *both* hour bins and the chart double-
    // counts. (#H7)
    const hourPieces: Piece[] = []
    for (const p of dayPieces) {
      if (p.startMs < hourEnd && p.endMs > hourStart) {
        const s = Math.max(p.startMs, hourStart)
        const e = Math.min(p.endMs, hourEnd)
        if (s < e) hourPieces.push({ ...p, startMs: s, endMs: e })
      }
    }
    if (hourPieces.length === 0) continue
    const r = recon(hourPieces)
    effortSeries.push({ hour: h, effortMin: r.effortMin, wallClockMin: r.wallClockMin })
  }

  return {
    date: input.date,
    workers: { humans, agents },
    structure: {
      clients: clientCount?.c ?? 0,
      projects: projectCount?.c ?? 0,
      jobs: jobCount?.c ?? 0,
    },
    todayBillableCents: dayR.cents,
    todayPremiumMin: dayR.premiumMin,
    utilization: humans > 0 ? dayR.wallClockMin / (humans * dayMinutes) : 0,
    perWorker,
    effortSeries,
  }
}

export async function perJob(deps: Deps, ctx: SessionContext, input: PeriodInput): Promise<JobRecon[]> {
  const { db } = deps
  const pieces = await loadPieces(deps, input, scopeFor(ctx))
  const byJob = groupBy(pieces, 'jobId')
  const jobIds = [...byJob.keys()]
  if (jobIds.length === 0) return []

  const jobRows = await db
    .select({
      id: schema.jobs.id,
      name: schema.jobs.name,
      projectName: schema.projects.name,
      clientName: schema.clients.name,
    })
    .from(schema.jobs)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.jobs.projectId))
    .innerJoin(schema.clients, eq(schema.clients.id, schema.projects.clientId))
    .where(inArray(schema.jobs.id, jobIds))
    .all()
  const jobMap = new Map(jobRows.map((j) => [j.id, j]))

  const keepCents = canSeeMoney(ctx)
  return jobIds
    .sort()
    .map((jobId) => {
      const j = jobMap.get(jobId)!
      const r = recon(byJob.get(jobId)!)
      return { jobId, jobName: j.name, projectName: j.projectName, clientName: j.clientName, ...makeRecon(r, keepCents) }
    })
}
