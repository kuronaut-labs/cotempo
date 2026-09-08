import type { Trio, Range } from '~/lib/dayMath'
import type { SessionContext } from '~/server/context'
import type { schema } from '~/server/db'
import type { CreateIntervalInput, UpdateIntervalInput, DeleteIntervalInput, DayQuery, ListIntervalsInput } from '~/lib/schemas/intervals'
import type { Deps } from './deps'

export type IntervalRow = typeof schema.intervals.$inferSelect

export type DayIntervalRow = {
  id: string
  workerId: string
  jobId: string
  jobName: string
  clientName: string
  startedAt: Date
  endedAt: Date
  note: string | null
  editCount: number
  createdBy: string
}

export type DayView = { day: Range; date: string; intervals: DayIntervalRow[]; trioByWorker: Record<string, Trio> }

/* Guard order for every mutation (Task 4.1): assertCanEditWorker → live job (snapshot rate)
   → same-job overlap → assertWeeksEditable(before ∪ after week keys) → write → resetSubmittedWeeks. */

export async function createInterval(_deps: Deps, _ctx: SessionContext, _input: CreateIntervalInput): Promise<IntervalRow> {
  throw new Error('TODO Task 4.1')
}

export async function updateInterval(_deps: Deps, _ctx: SessionContext, _input: UpdateIntervalInput): Promise<IntervalRow> {
  throw new Error('TODO Task 4.1')
}

export async function deleteInterval(_deps: Deps, _ctx: SessionContext, _input: DeleteIntervalInput): Promise<void> {
  throw new Error('TODO Task 4.1')
}

/** Intervals intersecting the local day for self + supervisees (or one worker), clipped for the trio. Time only (#5). */
export async function listDay(_deps: Deps, _ctx: SessionContext, _input: DayQuery): Promise<DayView> {
  throw new Error('TODO Task 4.1')
}

export async function listIntervals(
  _deps: Deps,
  _ctx: SessionContext,
  _input: ListIntervalsInput,
): Promise<{ rows: IntervalRow[]; nextCursor: string | null }> {
  throw new Error('TODO Task 4.1')
}
