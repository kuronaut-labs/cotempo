import {
  dayBoundariesWithin,
  mergeRanges,
  minutesBetween,
  splitRangeAtBoundaries,
  type Range,
} from './dayMath'
import { moneyCents } from './money'

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

export type Recon = {
  wallClockMin: number
  effortMin: number
  premiumMin: number
  billableMin: number
  cents: number
}

/** Split one interval at local-day boundaries in `tz`; each piece belongs to its day. */
export function explode(interval: ExplodableInterval, tz: string): Piece[] {
  const range: Range = { startMs: interval.startMs, endMs: interval.endMs }
  const cuts = dayBoundariesWithin(range, tz)
  const ranges = splitRangeAtBoundaries(range, cuts)
  return ranges.map((r) => ({
    intervalId: interval.id,
    workerId: interval.workerId,
    jobId: interval.jobId,
    clientId: interval.clientId,
    // The piece's day is the local date of its START — which is on its day because
    // splitRangeAtBoundaries cuts at midnight boundaries.
    day: dayOfPieceStart(r.startMs, tz),
    startMs: r.startMs,
    endMs: r.endMs,
    rateCents: interval.rateCents,
  }))
}

function dayOfPieceStart(ms: number, tz: string): string {
  // Use Intl to format the local date as YYYY-MM-DD. Matches dayMath.localDateOf
  // semantics; inlined here to avoid a circular import at type level.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(new Date(ms))
}

/** Clip pieces to [startMs, endMs); drops pieces fully outside, trims partial ones. */
export function clipPieces(pieces: Piece[], startMs: number, endMs: number): Piece[] {
  const out: Piece[] = []
  for (const p of pieces) {
    const s = Math.max(p.startMs, startMs)
    const e = Math.min(p.endMs, endMs)
    if (s < e) {
      out.push({ ...p, startMs: s, endMs: e, day: s === p.startMs ? p.day : dayOfPieceStart(s, 'UTC') })
    }
  }
  return out
}

export function groupBy<K extends keyof Piece>(pieces: Piece[], key: K): Map<Piece[K], Piece[]> {
  const out = new Map<Piece[K], Piece[]>()
  for (const p of pieces) {
    const k = p[key]
    const list = out.get(k) ?? []
    list.push(p)
    out.set(k, list)
  }
  return out
}

/* effort = Σ minutes; wall-clock = Σ over workers of union(that worker's pieces);
   premium = effort − wall-clock; billableMin = Σ minutes with rateCents !== null;
   cents = moneyCents over all pieces, rounded once (#7, #18). */
export function recon(pieces: Piece[]): Recon {
  let effortMin = 0
  let billableMin = 0
  for (const p of pieces) {
    const minutes = minutesBetween(p.startMs, p.endMs)
    effortMin += minutes
    if (p.rateCents !== null) billableMin += minutes
  }
  let wallClockMin = 0
  const byWorker = groupBy(pieces, 'workerId')
  for (const [, wsPieces] of byWorker) {
    const ranges = wsPieces.map((p) => ({ startMs: p.startMs, endMs: p.endMs }))
    const merged = mergeRanges(ranges)
    for (const r of merged) wallClockMin += minutesBetween(r.startMs, r.endMs)
  }
  const premiumMin = effortMin - wallClockMin
  const cents = moneyCents(
    pieces.map((p) => ({ minutes: minutesBetween(p.startMs, p.endMs), rateCents: p.rateCents })),
  )
  return { wallClockMin, effortMin, premiumMin, billableMin, cents }
}

