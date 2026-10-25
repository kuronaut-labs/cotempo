import { describe, expect, it } from 'vitest'
import { explode, type Piece } from '~/lib/attribution'
import { redFlags, type RedFlagInput } from '~/lib/redFlags'

const TZ = 'Australia/Perth'
const WEEK = '2026-08-31'
const DAY = '2026-09-02'
const worker = { id: 'w', supervisorId: 'sup' }

type Iv = RedFlagInput['intervals'][number]
type Raw = [id: string, start: string, end: string]

const ms = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+08:00`)

const toIv = ([id, start, end]: Raw): Iv => ({
  id,
  startedAt: ms(DAY, start),
  endedAt: ms(DAY, end),
  createdAt: ms(DAY, '17:05'),
  editCount: 0,
  createdBy: 'w',
})

const piecesOf = (ivs: Iv[]): Piece[] =>
  ivs.flatMap((iv) =>
    explode({ id: iv.id, workerId: 'w', jobId: 'j', clientId: 'c', startMs: iv.startedAt, endMs: iv.endedAt, rateCents: 1 }, TZ),
  )

const gapOnDay = (raws: Raw[]) => {
  const ivs = raws.map(toIv)
  return redFlags({ weekStart: WEEK, tz: TZ, worker, intervals: ivs, pieces: piecesOf(ivs) }).find(
    (f) => f.kind === 'gap' && f.day === DAY,
  )
}

describe('gap uses unioned wall-clock, not summed piece minutes', () => {
  it('three overlapping jobs 09–14 report the union 300 min, not 720', () => {
    const gap = gapOnDay([
      ['a', '09:00', '13:00'],
      ['b', '09:30', '13:30'],
      ['c', '10:00', '14:00'],
    ])
    expect(gap).toBeTruthy()
    expect(gap!.detail).toContain('300 min')
    expect(gap!.detail).not.toContain('720 min')
  })

  it('fully-duplicated 09–17 intervals still cover the day (union 480 → no gap)', () => {
    const gap = gapOnDay([
      ['a', '09:00', '17:00'],
      ['b', '09:00', '17:00'],
    ])
    expect(gap).toEqual(undefined)
  })
})

it('templates the gap threshold into the detail (byte-identical at default)', () => {
  const ivs = [toIv(['a', '09:00', '14:00'])]
  const input = { weekStart: WEEK, tz: TZ, worker, intervals: ivs, pieces: piecesOf(ivs) }
  const onDay = (flags: ReturnType<typeof redFlags>) => flags.find((f) => f.kind === 'gap' && f.day === DAY)!.detail
  expect(onDay(redFlags(input))).toBe(`Only 300 min on ${DAY} (< 8h).`)
  expect(onDay(redFlags(input, { gapMinWallMin: 450, lateEntryDays: 7, multiEditOver: 2 }))).toBe(`Only 300 min on ${DAY} (< 7.5h).`)
})

describe('late_entry across a DST change (#23)', () => {
  // Sydney week of 2026-09-28 ends Sun 2026-10-04 24:00 AEDT; seven local days later is Oct 11 24:00 AEDT = 13:00Z.
  const late = (createdAt: number) => {
    const iv = { id: 'x', startedAt: Date.UTC(2026, 8, 30, 0), endedAt: Date.UTC(2026, 8, 30, 1), createdAt, editCount: 0, createdBy: 'w' }
    const flags = redFlags({ weekStart: '2026-09-28', tz: 'Australia/Sydney', worker, intervals: [iv], pieces: [] })
    return flags.some((f) => f.kind === 'late_entry')
  }
  it('flags an entry made at 00:30 on the Monday after the window', () => {
    expect(late(Date.UTC(2026, 9, 11, 13, 30))).toBe(true)
  })
  it('does not flag one made at 23:30 on the last Sunday of the window', () => {
    expect(late(Date.UTC(2026, 9, 11, 12, 30))).toBe(false)
  })
})
