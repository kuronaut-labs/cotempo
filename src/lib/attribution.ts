import type { Trio } from './dayMath'

/** One interval fragment lying inside a single local day (#7 attribution rule). */
export type Piece = {
  intervalId: string
  workerId: string
  jobId: string
  clientId: string
  day: string // 'YYYY-MM-DD' in org tz
  startMs: number
  endMs: number
  rateCents: number | null
}

export type ExplodableInterval = {
  id: string
  workerId: string
  jobId: string
  clientId: string
  startMs: number
  endMs: number
  rateCents: number | null
}

export type Recon = Trio & { billableMin: number; cents: number }

/** Split one interval at local-day boundaries in `tz`; each piece belongs to its day. */
export function explode(_iv: ExplodableInterval, _tz: string): Piece[] {
  throw new Error('TODO Task 5.1')
}

/** Clip pieces to [startMs, endMs); drops pieces fully outside, trims partial ones. */
export function clipPieces(_pieces: Piece[], _startMs: number, _endMs: number): Piece[] {
  throw new Error('TODO Task 5.1')
}

/* effort = Σ minutes; wall-clock = Σ over workers of union(that worker's pieces);
   premium = effort − wall-clock; billableMin = Σ minutes with rateCents !== null;
   cents = moneyCents over all pieces, rounded once (#7, #18). */
export function recon(_pieces: Piece[]): Recon {
  throw new Error('TODO Task 5.1')
}

export function groupBy<K extends keyof Piece>(_pieces: Piece[], _key: K): Map<Piece[K], Piece[]> {
  throw new Error('TODO Task 5.1')
}
