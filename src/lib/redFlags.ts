import type { Piece } from './attribution'

export type FlagKind = 'gap' | 'late_entry' | 'multi_edit' | 'retroactive' | 'non_supervisor'
export type Flag = { kind: FlagKind; intervalId?: string; day?: string; detail: string }

export const defaults = { gapMinWallMin: 8 * 60, lateEntryDays: 7, multiEditOver: 2 }
export type FlagConfig = typeof defaults

export type RedFlagInput = {
  weekStart: string
  tz: string
  worker: { id: string; supervisorId: string | null }
  intervals: { id: string; startedAt: number; endedAt: number; createdAt: number; editCount: number; createdBy: string }[]
  pieces: Piece[]
}

/* gap: a Mon–Fri day with no pieces or wall-clock < gapMinWallMin.
   late_entry: createdAt > end of week + lateEntryDays.
   multi_edit: editCount > multiEditOver.
   retroactive: localDateOf(createdAt) > localDateOf(startedAt).
   non_supervisor: createdBy ∉ {worker.id, worker.supervisorId} (#12, #17). */
export function redFlags(_input: RedFlagInput, _cfg: FlagConfig = defaults): Flag[] {
  throw new Error('TODO Task 6.1')
}
