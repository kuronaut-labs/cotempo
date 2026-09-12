import { and, eq, gt, inArray, isNull, lt } from 'drizzle-orm'
import { clipPieces, explode, recon as piecesRecon, type Piece, type Recon } from '~/lib/attribution'
import { localDayBoundariesUtcMs } from '~/lib/dayMath'
import { moneyCents } from '~/lib/money'
import { HttpError } from '~/lib/errors'
import { canSeeMoney, type SessionContext } from '~/server/context'
import { schema, type Db } from '~/server/db'
import type { ExportCsvInput, InvoiceInput } from '~/lib/schemas/reports'
import { groupBy } from '~/lib/attribution'
import { loadPieces } from './reports'
import type { Deps } from './deps'

export const INTERVALS_CSV_COLUMNS = [
  'worker',
  'kind',
  'client',
  'project',
  'job',
  'day',
  'start',
  'end',
  'minutes',
  'billable_minutes',
  'rate_cents',
  'amount_cents',
  'wall_clock_minutes',
  'premium_minutes',
  'entered_by',
  'created_at',
  'edit_count',
  'org_timezone',
] as const

export const DAILY_CSV_COLUMNS = [
  'day',
  'client',
  'billable_minutes',
  'wall_clock_minutes',
  'premium_minutes',
  'amount_cents',
  'org_timezone',
] as const

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(',')
}

type IntervalRow = {
  id: string
  workerId: string
  jobId: string
  jobName: string
  projectName: string
  clientId: string
  clientName: string
  rateCents: number | null
  startedAt: Date
  endedAt: Date
  createdBy: string
  createdAt: Date
  editCount: number
}

async function loadIntervalRowsForCsv(db: Db, workerIds: string[], startMs: number, endMs: number): Promise<IntervalRow[]> {
  if (workerIds.length === 0) return []
  return db
    .select({
      id: schema.intervals.id,
      workerId: schema.intervals.workerId,
      workerKind: schema.workers.kind,
      workerName: schema.workers.name,
      jobId: schema.intervals.jobId,
      jobName: schema.jobs.name,
      projectName: schema.projects.name,
      clientId: schema.projects.clientId,
      clientName: schema.clients.name,
      rateCents: schema.intervals.rateCents,
      startedAt: schema.intervals.startedAt,
      endedAt: schema.intervals.endedAt,
      createdBy: schema.intervals.createdBy,
      createdAt: schema.intervals.createdAt,
      editCount: schema.intervals.editCount,
    })
    .from(schema.intervals)
    .innerJoin(schema.jobs, eq(schema.jobs.id, schema.intervals.jobId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.jobs.projectId))
    .innerJoin(schema.clients, eq(schema.clients.id, schema.projects.clientId))
    .innerJoin(schema.workers, eq(schema.workers.id, schema.intervals.workerId))
    .where(
      and(
        isNull(schema.intervals.deletedAt),
        inArray(schema.intervals.workerId, workerIds),
        lt(schema.intervals.startedAt, new Date(endMs)),
        gt(schema.intervals.endedAt, new Date(startMs)),
      ),
    )
    .all()
}

async function workerNamesForBilling(db: Db): Promise<Map<string, { name: string; kind: 'human' | 'agent' }>> {
  const rows = await db
    .select({
      id: schema.workers.id,
      kind: schema.workers.kind,
      workerName: schema.workers.name,
      userName: schema.user.name,
    })
    .from(schema.workers)
    .leftJoin(schema.humanWorkers, eq(schema.humanWorkers.workerId, schema.workers.id))
    .leftJoin(schema.user, eq(schema.user.id, schema.humanWorkers.userId))
    .all()
  return new Map(rows.map((r) => [r.id, { name: r.userName ?? r.workerName ?? '?', kind: r.kind }]))
}

function wallAndPremiumForWorkerDay(pieces: Piece[], workerId: string, day: string): { wallMin: number; premiumMin: number } {
  const dayPieces = pieces.filter((p) => p.workerId === workerId && p.day === day)
  const effort = dayPieces.reduce((s, p) => s + (p.endMs - p.startMs) / 60_000, 0)
  // Per-worker union = sum of disjoint pieces (no day-crossing after explode)
  const wall = dayPieces.reduce((s, p) => s + (p.endMs - p.startMs) / 60_000, 0)
  return { wallMin: Math.round(wall), premiumMin: Math.max(0, Math.round(effort - wall)) }
}

export async function exportCsv(
  deps: Deps,
  ctx: SessionContext,
  input: ExportCsvInput,
): Promise<{ filename: string; body: string }> {
  if (!canSeeMoney(ctx)) throw new HttpError(403, 'FORBIDDEN')
  const { db, tz } = deps
  const start = localDayBoundariesUtcMs(input.from, tz).startMs
  const end = localDayBoundariesUtcMs(input.to, tz).endMs

  const allWorkerIds = (await db.select({ id: schema.workers.id }).from(schema.workers).where(isNull(schema.workers.archivedAt)).all()).map((w) => w.id)
  const rows = await loadIntervalRowsForCsv(db, allWorkerIds, start, end)
  const wnames = await workerNamesForBilling(db)
  const filename = `timesheets-${input.from}_${input.to}-${input.view}.csv`

  if (input.view === 'intervals') {
    const allPieces: Piece[] = []
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
      for (const p of clipPieces(pieces, start, end)) allPieces.push(p)
    }
    const out: string[] = [csvRow(INTERVALS_CSV_COLUMNS as unknown as string[])]
    for (const p of allPieces) {
      const interval = rows.find((r) => r.id === p.intervalId)!
      const minutes = Math.round((p.endMs - p.startMs) / 60_000)
      const billableMin = p.rateCents === null ? 0 : minutes
      const amount = moneyCents([{ minutes, rateCents: p.rateCents }])
      const { wallMin, premiumMin } = wallAndPremiumForWorkerDay(allPieces, p.workerId, p.day)
      const wn = wnames.get(p.workerId)
      const creator = wnames.get(interval.createdBy)
      out.push(
        csvRow([
          wn?.name ?? p.workerId, // worker
          wn?.kind ?? '', // kind
          interval.clientName, // client
          interval.projectName, // project
          interval.jobName, // job
          p.day, // day
          new Date(p.startMs).toISOString(), // start
          new Date(p.endMs).toISOString(), // end
          minutes, // minutes
          billableMin, // billable_minutes
          p.rateCents ?? '', // rate_cents
          amount, // amount_cents
          wallMin, // wall_clock_minutes
          premiumMin, // premium_minutes
          creator?.name ?? interval.createdBy, // entered_by
          interval.createdAt.toISOString(), // created_at
          interval.editCount, // edit_count
          tz, // org_timezone
        ]),
      )
    }
    return { filename, body: out.join('\n') + '\n' }
  }

  // view === 'daily'
  const pieces = await loadPieces(deps, { from: input.from, to: input.to })
  const byDay = groupBy(pieces, 'day')
  const byClient = groupBy(pieces, 'clientId')
  const clientNames = await db
    .select({ id: schema.clients.id, name: schema.clients.name })
    .from(schema.clients)
    .where(inArray(schema.clients.id, [...byClient.keys()]))
    .all()
  const nameMap = new Map(clientNames.map((c) => [c.id, c.name]))
  const out: string[] = [csvRow(DAILY_CSV_COLUMNS as unknown as string[])]
  for (const day of [...byDay.keys()].sort()) {
    for (const [clientId, dayClientPieces] of groupBy(byDay.get(day)!, 'clientId')) {
      const r = piecesRecon(dayClientPieces)
      out.push(
        csvRow([
          day,
          nameMap.get(clientId) ?? clientId,
          r.billableMin,
          r.wallClockMin,
          r.premiumMin,
          r.cents,
          tz,
        ]),
      )
    }
  }
  return { filename, body: out.join('\n') + '\n' }
}

export type InvoiceLine = { jobId: string; job: string; project: string; billableMin: number; rateCents: number | null; cents: number }
export type Invoice = {
  client: { id: string; name: string }
  period: { from: string; to: string }
  lines: InvoiceLine[]
  subtotalCents: number // Σ line cents — invoice is authoritative (#18)
  recon: Recon
  generatedAt: Date
  orgTimezone: string
}

export async function invoiceData(deps: Deps, ctx: SessionContext, input: InvoiceInput): Promise<Invoice> {
  if (!canSeeMoney(ctx)) throw new HttpError(403, 'FORBIDDEN')
  const { db, tz } = deps
  const pieces = await loadPieces(deps, { from: input.from, to: input.to }, { clientId: input.clientId })
  const byJob = groupBy(pieces, 'jobId')
  const jobIds = [...byJob.keys()]
  const jobRows = jobIds.length
    ? await db
        .select({ id: schema.jobs.id, name: schema.jobs.name, projectName: schema.projects.name, clientId: schema.projects.clientId, clientName: schema.clients.name, rate: schema.jobs.billableRateCents })
        .from(schema.jobs)
        .innerJoin(schema.projects, eq(schema.projects.id, schema.jobs.projectId))
        .innerJoin(schema.clients, eq(schema.clients.id, schema.projects.clientId))
        .where(inArray(schema.jobs.id, jobIds))
        .all()
    : []
  const jobMap = new Map(jobRows.map((j) => [j.id, j]))
  const clientInfo = jobRows[0]
    ? { id: jobRows[0].clientId, name: jobRows[0].clientName }
    : { id: input.clientId, name: '?' }
  const lines: InvoiceLine[] = []
  let subtotalCents = 0
  for (const [jobId, jobPieces] of [...byJob.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const billablePieces = jobPieces.filter((p) => p.rateCents !== null)
    if (billablePieces.length === 0) continue // non-billable jobs excluded
    const billableMin = billablePieces.reduce((s, p) => s + (p.endMs - p.startMs) / 60_000, 0)
    const rate = billablePieces[0]!.rateCents!
    const cents = moneyCents(
      billablePieces.map((p) => ({ minutes: Math.round((p.endMs - p.startMs) / 60_000), rateCents: p.rateCents })),
    )
    const job = jobMap.get(jobId)!
    lines.push({ jobId, job: job.name, project: job.projectName, billableMin: Math.round(billableMin), rateCents: rate, cents })
    subtotalCents += cents
  }
  return {
    client: clientInfo,
    period: { from: input.from, to: input.to },
    lines,
    subtotalCents,
    recon: piecesRecon(pieces),
    generatedAt: deps.now(),
    orgTimezone: tz,
  }
}
