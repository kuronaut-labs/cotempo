import { z } from 'zod'
import { and, eq, gt, inArray, isNull, lt, sql, type SQL } from 'drizzle-orm'
import {
  clipPieces,
  explode,
  groupBy,
  recon,
  type Piece,
  type Recon,
} from '~/lib/attribution'
import { localDayBoundariesUtcMs, localHHMM, minutesBetween } from '~/lib/dayMath'
import { moneyCents } from '~/lib/money'
import { HttpError } from '~/lib/errors'
import { WeeksInput, type KpiInput, type PeriodInput } from '~/lib/schemas/reports'
import { canSeeMoney, hasRole, type SessionContext } from '~/server/context'
import { schema, type Db } from '~/server/db'
import { inChunks } from '~/server/inChunks'
import type { Deps } from './deps'
import { getOrgSettings } from './settings'
import { isoWeekStart, weekDates } from '~/lib/week'

/** Recon without money, for operators (#5). */
export type TimeRecon = Omit<Recon, 'cents'>
/** `cents` present only when canSeeMoney(ctx). Never send the key to an operator. */
export type RoleRecon = Recon | TimeRecon

export type ClientRecon = { clientId: string; name: string } & RoleRecon
export type ReconciliationReport = { clients: ClientRecon[]; total: RoleRecon; realization?: Record<string, ClientRealization> }
/** Same minutes valued at the CURRENT job rate (#positions makes them diverge from actuals). */
export type ClientRealization = { standardCents: number; realizationPct: number | null }

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
  utilization: number // Σ wall-clock / (active humans × default day), 0..1+
  perWorker: { workerId: string; name: string; wallClockMin: number; utilization: number }[]
  effortSeries: { hour: number; effortMin: number; wallClockMin: number }[]
  defaultDayMinutes: number
  weekWallClockMin?: number
  weeklyTargetHours: number | null
}

export type JobRecon = { jobId: string; projectId: string; jobName: string; projectName: string; clientName: string } & RoleRecon & {
  budgetCents?: number | null
  consumedCents?: number
  budgetPct?: number | null
}

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
  filter: { workerIds?: string[]; clientId?: string; jobIds?: string[]; projectId?: string } = {},
) {
  const conds: SQL[] = [
    isNull(schema.intervals.deletedAt),
    lt(schema.intervals.startedAt, new Date(endMs)),
    gt(schema.intervals.endedAt, new Date(startMs)),
  ]
  if (filter.projectId) conds.push(eq(schema.jobs.projectId, filter.projectId))
  // Archived jobs keep their historical time everywhere: archiving stops new entries, not billing for past work (#H5).
  if (filter.clientId) conds.push(eq(schema.projects.clientId, filter.clientId))
  const query = (extra?: SQL) => db
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
    .where(and(...conds, extra))
    .all()

  // Id lists are chunked (D1 caps bound parameters at 100). With both filters, only worker ids go to SQL.
  const jobIds = filter.jobIds?.length ? new Set(filter.jobIds) : null
  if (filter.workerIds?.length) {
    const rows = await inChunks(filter.workerIds, (chunk) => query(inArray(schema.intervals.workerId, chunk)))
    return jobIds ? rows.filter((r) => jobIds.has(r.jobId)) : rows
  }
  if (jobIds) return inChunks(jobIds, (chunk) => query(inArray(schema.intervals.jobId, chunk)))
  return query()
}

async function clientNameMap(db: Db, clientIds: string[]): Promise<Map<string, string>> {
  if (clientIds.length === 0) return new Map()
  const rows = await inChunks(clientIds, (chunk) =>
    db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).where(inArray(schema.clients.id, chunk)).all(),
  )
  return new Map(rows.map((r) => [r.id, r.name]))
}

/** Intervals intersecting [start(from), end(to)) in org tz, joined to job→project→client, exploded and trimmed. */
export async function loadPieces(
  deps: Deps,
  period: PeriodInput,
  filter: { workerIds?: string[]; clientId?: string; jobIds?: string[]; projectId?: string } = {},
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
  const keepCents = canSeeMoney(ctx)
  const pieces = await loadPieces(deps, input, scopeFor(ctx))
  const byClient = groupBy(pieces, 'clientId')
  const names = await clientNameMap(db, [...byClient.keys()])

  // B2: standard value of the same minutes at current job rates. When a position
  // overrides the job rate at write time (#positions) the two diverge.
  const jobRates = new Map<string, number | null>()
  if (keepCents) {
    const jobIds = [...new Set(pieces.map((p) => p.jobId))]
    if (jobIds.length > 0) {
      const rows = await inChunks(jobIds, (chunk) =>
        db
          .select({ id: schema.jobs.id, billableRateCents: schema.jobs.billableRateCents })
          .from(schema.jobs)
          .where(inArray(schema.jobs.id, chunk))
          .all(),
      )
      for (const j of rows) jobRates.set(j.id, j.billableRateCents)
    }
  }

  const clients: ClientRecon[] = [...byClient.keys()]
    .sort()
    .map((clientId) => {
      const r = recon(byClient.get(clientId)!)
      return { clientId, name: names.get(clientId) ?? '?', ...makeRecon(r, keepCents) }
    })

  const totalR = recon(pieces)
  const report: ReconciliationReport = { clients, total: makeRecon(totalR, keepCents) }
  if (keepCents) {
    const realization: Record<string, ClientRealization> = {}
    for (const [clientId, clientPieces] of byClient) {
      const standard = moneyCents(
        clientPieces.map((p) => ({ minutes: minutesBetween(p.startMs, p.endMs), rateCents: jobRates.get(p.jobId) ?? null })),
      )
      const actual = recon(clientPieces).cents
      realization[clientId] = { standardCents: standard, realizationPct: standard > 0 ? Math.round((actual / standard) * 100) : null }
    }
    report.realization = realization
  }
  return report
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

  const workerRows = await inChunks(workerIds, (chunk) =>
    db
      .select({ id: schema.workers.id, kind: schema.workers.kind, name: schema.workers.name })
      .from(schema.workers)
      .where(inArray(schema.workers.id, chunk))
      .all(),
  )
  const workerMap = new Map(workerRows.map((w) => [w.id, w]))

  const humanIds = workerRows.filter((w) => w.kind === 'human').map((w) => w.id)
  const userNames = new Map<string, string>()
  if (humanIds.length > 0) {
    const rows = await inChunks(humanIds, (chunk) =>
      db
        .select({ workerId: schema.humanWorkers.workerId, name: schema.user.name })
        .from(schema.humanWorkers)
        .innerJoin(schema.user, eq(schema.user.id, schema.humanWorkers.userId))
        .where(inArray(schema.humanWorkers.workerId, chunk))
        .all(),
    )
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

export type WeekTrend = {
  weekStart: string
  wallClockMin: number
  effortMin: number
  premiumMin: number
  utilization: number
}

/* Org-wide weekly aggregates, oldest → newest, for the billing/admin tab (B1).
   Utilization = wall-clock over (active humans × default day minutes × 5 weekdays);
   adminKpis' single-day denominator would read 100% for one day's work in a week. */
const WEEKDAYS = 5
export async function weeklyTrends(
  deps: Deps,
  ctx: SessionContext,
  input: z.infer<typeof WeeksInput>,
): Promise<WeekTrend[]> {
  if (!canSeeMoney(ctx)) throw new HttpError(403, 'FORBIDDEN')
  const { db, tz } = deps
  const settings = await getOrgSettings(deps, ctx)
  const humans = await db
    .select({ id: schema.workers.id })
    .from(schema.workers)
    .where(and(eq(schema.workers.kind, 'human'), isNull(schema.workers.archivedAt)))
    .all()
  const dayMinutes = settings.defaultDayMinutes
  const [y, m, d] = isoWeekStart(deps.now().getTime(), tz).split('-').map(Number) as [number, number, number]
  const out: WeekTrend[] = []
  for (let i = input.weeks - 1; i >= 0; i--) {
    // Step in calendar weeks: subtracting 7 × 24h lands on Sunday across a DST change (#23).
    const weekStart = new Date(Date.UTC(y, m - 1, d - 7 * i)).toISOString().slice(0, 10)
    const days = weekDates(weekStart)
    const pieces = await loadPieces(deps, { from: weekStart, to: days[6]! })
    const r = recon(pieces)
    out.push({
      weekStart,
      wallClockMin: r.wallClockMin,
      effortMin: r.effortMin,
      premiumMin: r.premiumMin,
      utilization: humans.length > 0 ? r.wallClockMin / (humans.length * dayMinutes * WEEKDAYS) : 0,
    })
  }
  return out
}

export async function adminKpis(deps: Deps, ctx: SessionContext, input: KpiInput): Promise<AdminKpis> {
  if (!canSeeMoney(ctx)) throw new HttpError(403, 'FORBIDDEN')
  const { db, tz } = deps
  const settings = await getOrgSettings(deps, ctx)
  const dayMinutes = settings.defaultDayMinutes

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
  const day = localDayBoundariesUtcMs(input.date, tz)

  const byWorker = groupBy(dayPieces, 'workerId')
  const workerIds = [...byWorker.keys()]
  const humanNames = await inChunks(workerIds, (chunk) =>
    db
      .select({ workerId: schema.humanWorkers.workerId, name: schema.user.name })
      .from(schema.humanWorkers)
      .innerJoin(schema.user, eq(schema.user.id, schema.humanWorkers.userId))
      .where(inArray(schema.humanWorkers.workerId, chunk))
      .all(),
  )
  const nameMap = new Map(humanNames.map((u) => [u.workerId, u.name]))
  // Agents carry their display name on the workers row (mirrors operatorLanes).
  const missingIds = workerIds.filter((id) => !nameMap.has(id))
  if (missingIds.length > 0) {
    const rows = await inChunks(missingIds, (chunk) =>
      db.select({ id: schema.workers.id, name: schema.workers.name }).from(schema.workers).where(inArray(schema.workers.id, chunk)).all(),
    )
    for (const w of rows) if (!nameMap.has(w.id)) nameMap.set(w.id, w.name ?? '?')
  }

  const perWorker = workerIds.map((workerId) => {
    const r = recon(byWorker.get(workerId)!)
    return {
      workerId,
      name: nameMap.get(workerId) ?? '?',
      wallClockMin: r.wallClockMin,
      // Per-worker denominator is a single default day (org setting), not the
      // org-wide headcount × default day. The aggregate `utilization` below
      // keeps the org-wide form. (#M1)
      utilization: r.wallClockMin / dayMinutes,
    }
  })

  // Walk the day's real hours (23 or 25 on DST days) and bin by local hour; a repeated
  // fall-back hour shares one bin. Pieces are clipped per hour so a 2h interval isn't counted in both bins (#H7).
  const byHour = new Map<number, Piece[]>()
  for (let hourStart = day.startMs; hourStart < day.endMs; hourStart += 3_600_000) {
    const hourEnd = Math.min(hourStart + 3_600_000, day.endMs)
    const hour = Number(localHHMM(hourStart, tz).slice(0, 2))
    for (const p of dayPieces) {
      const s = Math.max(p.startMs, hourStart)
      const e = Math.min(p.endMs, hourEnd)
      if (s < e) byHour.set(hour, [...(byHour.get(hour) ?? []), { ...p, startMs: s, endMs: e }])
    }
  }
  const effortSeries = [...byHour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, pieces]) => {
      const r = recon(pieces)
      return { hour, effortMin: r.effortMin, wallClockMin: r.wallClockMin }
    })

  const weekStartIso = isoWeekStart(deps.now().getTime(), deps.tz)
  const weekEndIso = weekDates(weekStartIso)[6]!
  const weekR = recon(await loadPieces(deps, { from: weekStartIso, to: weekEndIso }))

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
    defaultDayMinutes: dayMinutes,
    weekWallClockMin: weekR.wallClockMin,
    weeklyTargetHours: settings.defaultWeeklyTargetHours,
  }
}

export async function perJob(deps: Deps, ctx: SessionContext, input: PeriodInput): Promise<JobRecon[]> {
  const { db } = deps
  const pieces = await loadPieces(deps, input, scopeFor(ctx))
  const byJob = groupBy(pieces, 'jobId')
  const jobIds = [...byJob.keys()]
  if (jobIds.length === 0) return []

  const jobRows = await inChunks(jobIds, (chunk) =>
    db
      .select({
        id: schema.jobs.id,
        name: schema.jobs.name,
        projectId: schema.jobs.projectId,
        projectName: schema.projects.name,
        clientName: schema.clients.name,
        budgetCents: schema.jobs.budgetCents,
      })
      .from(schema.jobs)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.jobs.projectId))
      .innerJoin(schema.clients, eq(schema.clients.id, schema.projects.clientId))
      .where(inArray(schema.jobs.id, chunk))
      .all(),
  )
  const jobMap = new Map(jobRows.map((j) => [j.id, j]))

  const keepCents = canSeeMoney(ctx)
  // B3: all-time spend per job (wide window; demo scale fine) for budget vs consumed.
  const allTimePieces: Piece[] = []
  if (keepCents) {
    const wide = await loadPieces(deps, { from: '2000-01-01', to: '2100-01-01' }, { jobIds })
    allTimePieces.push(...wide)
  }
  return jobIds
    .sort()
    .map((jobId) => {
      const j = jobMap.get(jobId)!
      const r = recon(byJob.get(jobId)!)
      const base: JobRecon = { jobId, projectId: j.projectId, jobName: j.name, projectName: j.projectName, clientName: j.clientName, ...makeRecon(r, keepCents) }
      if (keepCents) {
        const budget = j.budgetCents ?? null
        const consumed = recon(allTimePieces.filter((p) => p.jobId === jobId)).cents
        base.budgetCents = budget
        base.consumedCents = consumed
        base.budgetPct = budget != null && budget > 0 ? Math.round((consumed / budget) * 100) : null
      }
      return base
    })
}
