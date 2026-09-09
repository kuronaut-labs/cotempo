import { describe, expect, it } from 'vitest'
import {
  assertMinuteAligned,
  computeTrio,
  dayBoundariesWithin,
  findSameJobOverlaps,
  localDateOf,
  localDayBoundariesUtcMs,
  localHHMM,
  mergeRanges,
  minutesBetween,
  splitRangeAtBoundaries,
} from '~/lib/dayMath'

const H = 3_600_000
const M = 60_000

describe('minute alignment (#22)', () => {
  it('rejects sub-minute instants', () => {
    expect(() => assertMinuteAligned(90_500)).toThrow(RangeError)
    expect(() => minutesBetween(0, 90_500)).toThrow(RangeError)
    expect(() => assertMinuteAligned(1.5 * M)).toThrow(RangeError)
  })
  it('exact minutes', () => {
    expect(minutesBetween(0, 90 * M)).toBe(90)
  })
})

describe('mergeRanges / computeTrio (#7)', () => {
  it('merges overlapping and touching ranges', () => {
    expect(mergeRanges([{ startMs: 0, endMs: 2 * H }, { startMs: H, endMs: 3 * H }, { startMs: 3 * H, endMs: 4 * H }])).toEqual([
      { startMs: 0, endMs: 4 * H },
    ])
    expect(mergeRanges([{ startMs: 5 * H, endMs: 6 * H }, { startMs: 0, endMs: H }])).toEqual([
      { startMs: 0, endMs: H },
      { startMs: 5 * H, endMs: 6 * H },
    ])
  })
  it('trio: 9–12 and 10–11 → wall 180, effort 240, premium 60', () => {
    expect(computeTrio([{ startMs: 9 * H, endMs: 12 * H }, { startMs: 10 * H, endMs: 11 * H }])).toEqual({
      wallClockMin: 180,
      effortMin: 240,
      premiumMin: 60,
    })
  })
  it('trio of nothing is zeros', () => {
    expect(computeTrio([])).toEqual({ wallClockMin: 0, effortMin: 0, premiumMin: 0 })
  })
})

describe('findSameJobOverlaps (#7)', () => {
  it('flags same worker + job, ignores cross-job and cross-worker', () => {
    const ivs = [
      { workerId: 'w1', jobId: 'j1', startMs: 0, endMs: 2 * H },
      { workerId: 'w1', jobId: 'j1', startMs: H, endMs: 3 * H }, // clash
      { workerId: 'w1', jobId: 'j2', startMs: H, endMs: 3 * H }, // fine: other job
      { workerId: 'w2', jobId: 'j1', startMs: H, endMs: 3 * H }, // fine: other worker
    ]
    expect(findSameJobOverlaps(ivs)).toEqual([{ workerId: 'w1', jobId: 'j1', overlapMs: H }])
  })
  it('touching intervals do not overlap', () => {
    expect(
      findSameJobOverlaps([
        { workerId: 'w', jobId: 'j', startMs: 0, endMs: H },
        { workerId: 'w', jobId: 'j', startMs: H, endMs: 2 * H },
      ]),
    ).toEqual([])
  })
})

describe('splitRangeAtBoundaries', () => {
  it('cuts only at interior boundaries', () => {
    expect(splitRangeAtBoundaries({ startMs: 0, endMs: 3 * H }, [3 * H, H, 0, 5 * H, 2 * H])).toEqual([
      { startMs: 0, endMs: H },
      { startMs: H, endMs: 2 * H },
      { startMs: 2 * H, endMs: 3 * H },
    ])
  })
})

describe('local day boundaries in the org zone (#23)', () => {
  const cases: [string, string, string, string][] = [
    ['2026-03-08', 'America/Los_Angeles', '2026-03-08T08:00:00.000Z', '2026-03-09T07:00:00.000Z'], // spring fwd, 23h
    ['2026-11-01', 'America/Los_Angeles', '2026-11-01T07:00:00.000Z', '2026-11-02T08:00:00.000Z'], // fall back, 25h
    ['2026-09-04', 'Asia/Kolkata', '2026-09-03T18:30:00.000Z', '2026-09-04T18:30:00.000Z'],
    ['2026-10-04', 'Australia/Sydney', '2026-10-03T14:00:00.000Z', '2026-10-04T13:00:00.000Z'], // spring fwd
    ['2026-04-05', 'Australia/Sydney', '2026-04-04T13:00:00.000Z', '2026-04-05T14:00:00.000Z'], // fall back
    ['2026-09-04', 'UTC', '2026-09-04T00:00:00.000Z', '2026-09-05T00:00:00.000Z'],
    ['2026-09-04', 'Australia/Perth', '2026-09-03T16:00:00.000Z', '2026-09-04T16:00:00.000Z'],
  ]
  it.each(cases)('%s in %s', (d, tz, s, e) => {
    const b = localDayBoundariesUtcMs(d, tz)
    expect(new Date(b.startMs).toISOString()).toBe(s)
    expect(new Date(b.endMs).toISOString()).toBe(e)
    expect(b.startMs % M).toBe(0)
  })
  it('localDateOf round-trips the start of each day', () => {
    for (const [d, tz] of cases) expect(localDateOf(localDayBoundariesUtcMs(d, tz).startMs, tz)).toBe(d)
  })
  it('localHHMM renders the wall clock in the given zone', () => {
    const t = Date.UTC(2026, 8, 3, 15, 5) // 23:05 Perth, 01:05 Sydney (AEST)
    expect(localHHMM(t, 'Australia/Perth')).toBe('23:05')
    expect(localHHMM(t, 'Australia/Sydney')).toBe('01:05')
    expect(localHHMM(t, 'UTC')).toBe('15:05')
  })
  it('dayBoundariesWithin lists interior midnights only', () => {
    const start = Date.UTC(2026, 8, 3, 15) // 23:00 Perth Sep 3
    const end = Date.UTC(2026, 8, 4, 17) // 01:00 Perth Sep 5
    expect(dayBoundariesWithin({ startMs: start, endMs: end }, 'Australia/Perth')).toEqual([Date.UTC(2026, 8, 3, 16), Date.UTC(2026, 8, 4, 16)])
    expect(dayBoundariesWithin({ startMs: start, endMs: Date.UTC(2026, 8, 3, 16) }, 'Australia/Perth')).toEqual([])
  })
})
