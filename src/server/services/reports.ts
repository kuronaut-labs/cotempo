import type { Piece, Recon } from '~/lib/attribution'
import type { SessionContext } from '~/server/context'
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
  totals: { byDay: Record<string, RoleRecon>; byClient: Record<string, RoleRecon>; all: RoleRecon }
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

/** Intervals intersecting [start(from), end(to)) in org tz, joined to job→project→client, exploded and trimmed. */
export async function loadPieces(
  _deps: Deps,
  _period: PeriodInput,
  _filter?: { workerIds?: string[]; clientId?: string },
): Promise<Piece[]> {
  throw new Error('TODO Task 5.1')
}

export async function reconciliation(_deps: Deps, _ctx: SessionContext, _input: PeriodInput): Promise<ReconciliationReport> {
  throw new Error('TODO Task 5.1')
}

export async function daily(_deps: Deps, _ctx: SessionContext, _input: PeriodInput): Promise<DailyReport> {
  throw new Error('TODO Task 5.1')
}

export async function operatorLanes(_deps: Deps, _ctx: SessionContext, _input: PeriodInput): Promise<OperatorLane[]> {
  throw new Error('TODO Task 5.1')
}

export async function adminKpis(_deps: Deps, _ctx: SessionContext, _input: KpiInput): Promise<AdminKpis> {
  throw new Error('TODO Task 5.1')
}

export async function perJob(_deps: Deps, _ctx: SessionContext, _input: PeriodInput): Promise<JobRecon[]> {
  throw new Error('TODO Task 5.1')
}
