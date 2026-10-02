import { and, eq, gt, gte, inArray, isNull, lt } from 'drizzle-orm'
import { clipPieces, explode, recon as piecesRecon, type Piece, type Recon } from '~/lib/attribution'
import { localDateOf, localDateTimeOf, localDayBoundariesUtcMs } from '~/lib/dayMath'
import { moneyCents, formatDecimalHours } from '~/lib/money'
import { HttpError } from '~/lib/errors'
import { canSeeMoney, type SessionContext } from '~/server/context'
import { schema, type Db } from '~/server/db'
import type { ExportCsvInput, InvoiceInput } from '~/lib/schemas/reports'
import { groupBy } from '~/lib/attribution'
import { loadPieces } from './reports'
import { allocationReport } from './allocations'
import { leaveExportRows } from './leave'
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
  'rate_dollars',
  'amount_dollars',
  'clock_minutes',
  'overlap_minutes',
  'entered_by',
  'created_at',
  'edit_count',
  'org_timezone',
] as const

export const LEAVE_CSV_COLUMNS = [
  'worker',
  'type',
  'startDay',
  'endDay',
  'hours',
  'status',
  'decidedBy',
] as const

export const EVENTS_CSV_COLUMNS = ['at', 'kind', 'worker', 'subject', 'actor', 'detail'] as const

export const ALLOCATIONS_CSV_COLUMNS = [
  'worker',
  'kind',
  'target_kind',
  'target',
  'client',
  'due_on',
  'allocated_minutes',
  'logged_minutes',
  'remaining_minutes',
  'pace',
] as const

export const DAILY_CSV_COLUMNS = [
  'day',
  'client',
  'billable_minutes',
  'clock_minutes',
  'overlap_minutes',
  'amount_dollars',
  'org_timezone',
] as const

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  // Excel/Sheets execute a cell whose first char is one of these as a formula.
  // Worker/job/client names and the operator-controlled `note` reach billing
  // staff, so prefix with a single quote to force text rendering. (#M9)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
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
  // `recon` computes wall-clock as the union of merged ranges via dayMath.mergeRanges,
  // so a worker's concurrent-job overlap reduces wall without reducing effort.
  // The old `effort === wall` reduce was structurally always 0. (#M2)
  const r = piecesRecon(dayPieces)
  return { wallMin: r.wallClockMin, premiumMin: r.premiumMin }
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

  // Archived workers keep their historical time in the intervals CSV — same
  // policy as the invoice/client views after #H5 (archiving stops *new*
  // entries, not billing for past work). (#M10)
  const allWorkerIds = (await db.select({ id: schema.workers.id }).from(schema.workers).all()).map((w) => w.id)
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
      for (const p of clipPieces(pieces, start, end, tz)) allPieces.push(p)
    }
    const out: string[] = [csvRow(INTERVALS_CSV_COLUMNS as unknown as string[])]
    for (const p of allPieces) {
      const interval = rows.find((r) => r.id === p.intervalId)!
      const minutes = Math.round((p.endMs - p.startMs) / 60_000)
      const billableMin = p.rateCents === null ? 0 : minutes
      const amountCents = moneyCents([{ minutes, rateCents: p.rateCents }])
      const { wallMin, premiumMin } = wallAndPremiumForWorkerDay(allPieces, p.workerId, p.day)
      const wn = wnames.get(p.workerId)
      const creator = wnames.get(interval.createdBy)
      // CSV is for billing staff who think in dollars, not cents; divide by 100 at the cell so the
      // on-screen format and the exported format stay aligned. Empty rate → empty cell. (#P3.18)
      const rateDollars = p.rateCents === null ? '' : (p.rateCents / 100).toFixed(2)
      const amountDollars = amountCents === 0 ? '0.00' : (amountCents / 100).toFixed(2)
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
          rateDollars, // rate_dollars
          amountDollars, // amount_dollars
          wallMin, // clock_minutes
          premiumMin, // overlap_minutes
          creator?.name ?? interval.createdBy, // entered_by
          interval.createdAt.toISOString(), // created_at
          interval.editCount, // edit_count
          tz, // org_timezone
        ]),
      )
    }
    return { filename, body: out.join('\n') + '\n' }
  }

  if (input.view === 'allocations') {
    const rows = await allocationReport(deps, ctx, {})
    const out: string[] = [csvRow(ALLOCATIONS_CSV_COLUMNS as unknown as string[])]
    for (const r of rows) {
      out.push(
        csvRow([
          r.workerName,
          r.workerKind,
          r.targetKind,
          r.targetName,
          r.clientName,
          r.dueOn ?? '',
          r.allocatedMinutes == null ? '' : String(r.allocatedMinutes),
          String(r.loggedMinutes),
          r.remainingMinutes == null ? '' : String(r.remainingMinutes),
          r.pace,
        ]),
      )
    }
    return { filename: `timesheets-${input.from}_${input.to}-allocations.csv`, body: out.join('\n') + '\n' }
  }

  if (input.view === 'events') {
    // C5: audit log — approval/leave/interval events; billing via the money gate above.
    const startMs = start
    const endMs = end

    const approvalRows = await db
      .select({
        kind: schema.approvalEvents.kind,
        at: schema.approvalEvents.at,
        actorWorkerId: schema.approvalEvents.actorWorkerId,
        reason: schema.approvalEvents.reason,
        workerId: schema.approvals.workerId,
        weekStart: schema.approvals.weekStart,
      })
      .from(schema.approvalEvents)
      .innerJoin(schema.approvals, eq(schema.approvals.id, schema.approvalEvents.approvalId))
      .where(and(gte(schema.approvalEvents.at, new Date(startMs)), lt(schema.approvalEvents.at, new Date(endMs))))
      .all()

    const leaveRows = await db
      .select({
        kind: schema.leaveEvents.kind,
        at: schema.leaveEvents.at,
        actorWorkerId: schema.leaveEvents.actorWorkerId,
        reason: schema.leaveEvents.reason,
        workerId: schema.leaveRequests.workerId,
        typeName: schema.leaveTypes.name,
        startDay: schema.leaveRequests.startDay,
        endDay: schema.leaveRequests.endDay,
      })
      .from(schema.leaveEvents)
      .innerJoin(schema.leaveRequests, eq(schema.leaveRequests.id, schema.leaveEvents.requestId))
      .innerJoin(schema.leaveTypes, eq(schema.leaveTypes.id, schema.leaveRequests.typeId))
      .where(and(gte(schema.leaveEvents.at, new Date(startMs)), lt(schema.leaveEvents.at, new Date(endMs))))
      .all()

    const intervalRows = await db
      .select({
        kind: schema.intervalEvents.kind,
        at: schema.intervalEvents.at,
        actorWorkerId: schema.intervalEvents.actorWorkerId,
        intervalId: schema.intervalEvents.intervalId,
        changes: schema.intervalEvents.changes,
        workerId: schema.intervals.workerId,
        jobName: schema.jobs.name,
        startedAt: schema.intervals.startedAt,
      })
      .from(schema.intervalEvents)
      .innerJoin(schema.intervals, eq(schema.intervals.id, schema.intervalEvents.intervalId))
      .innerJoin(schema.jobs, eq(schema.jobs.id, schema.intervals.jobId))
      .where(and(gte(schema.intervalEvents.at, new Date(startMs)), lt(schema.intervalEvents.at, new Date(endMs))))
      .all()

    const nameOf = (id: string) => wnames.get(id)?.name ?? '?'

    type Row = { at: Date; kind: string; workerId: string; actorId: string; subject: string; detail: string }
    const all: Row[] = [
      ...approvalRows.map((r) => ({
        at: r.at, kind: r.kind, workerId: r.workerId, actorId: r.actorWorkerId,
        subject: `week ${r.weekStart}`, detail: r.reason ?? '',
      })),
      ...leaveRows.map((r) => ({
        at: r.at, kind: `leave_${r.kind}`, workerId: r.workerId, actorId: r.actorWorkerId,
        subject: `${r.typeName} ${r.startDay}→${r.endDay}`, detail: r.reason ?? '',
      })),
      ...intervalRows.map((r) => ({
        at: r.at, kind: `interval_${r.kind}`, workerId: r.workerId, actorId: r.actorWorkerId,
        subject: `${r.jobName} ${localDateOf(r.startedAt.getTime(), tz)}`, detail: r.changes ?? '',
      })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime())

    const filename = `timesheets-${input.from}_${input.to}-events.csv`
    const out: string[] = [csvRow(EVENTS_CSV_COLUMNS as unknown as string[])]
    for (const r of all) {
      out.push(
        csvRow([
          localDateTimeOf(r.at.getTime(), tz),
          r.kind,
          nameOf(r.workerId),
          r.subject,
          nameOf(r.actorId),
          r.detail,
        ]),
      )
    }
    return { filename, body: out.join('\n') + '\n' }
  }

  if (input.view === 'leave') {
    const leaveRows = await leaveExportRows(deps, ctx, { from: input.from, to: input.to })
    const out: string[] = [csvRow(LEAVE_CSV_COLUMNS as unknown as string[])]
    for (const r of leaveRows) {
      out.push(
        csvRow([
          r.workerName, // worker
          r.typeName, // type
          r.startDay,
          r.endDay,
          formatDecimalHours(r.minutes), // hours
          r.status, // status verbatim — data export, not UI copy
          r.decidedBy ?? '', // decidedBy
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
          r.cents === 0 ? '0.00' : (r.cents / 100).toFixed(2),
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
