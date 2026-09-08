import type { SessionContext } from '~/server/context'
import type { ExportCsvInput, InvoiceInput } from '~/lib/schemas/reports'
import type { Recon } from '~/lib/attribution'
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

/** RFC 4180 rows; one row per piece for `intervals`, one per day×client for `daily` (#11, #14). */
export async function exportCsv(_deps: Deps, _ctx: SessionContext, _input: ExportCsvInput): Promise<{ filename: string; body: string }> {
  throw new Error('TODO Task 7.1')
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

export async function invoiceData(_deps: Deps, _ctx: SessionContext, _input: InvoiceInput): Promise<Invoice> {
  throw new Error('TODO Task 7.2')
}
