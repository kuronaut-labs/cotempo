import { describe, expect, it } from 'vitest'
import { computeTrio, localDayBoundariesUtcMs, minutesBetween } from '~/lib/dayMath'
import { isoWeekStart, weekKeysTouched } from '~/lib/week'
import { moneyCents } from '~/lib/money'

describe('contract #22 exact minutes', () => {
  it('sub-minute instants are rejected, never rounded', () => {
    expect(() => minutesBetween(0, 90_500)).toThrow(RangeError)
  })
})

describe('contract #23 org-zone day boundaries (DST matrix)', () => {
  it.each([
    ['2026-03-08', 'America/Los_Angeles', '2026-03-08T08:00:00.000Z', '2026-03-09T07:00:00.000Z'],
    ['2026-11-01', 'America/Los_Angeles', '2026-11-01T07:00:00.000Z', '2026-11-02T08:00:00.000Z'],
    ['2026-09-04', 'Asia/Kolkata', '2026-09-03T18:30:00.000Z', '2026-09-04T18:30:00.000Z'],
    ['2026-10-04', 'Australia/Sydney', '2026-10-03T14:00:00.000Z', '2026-10-04T13:00:00.000Z'],
    ['2026-04-05', 'Australia/Sydney', '2026-04-04T13:00:00.000Z', '2026-04-05T14:00:00.000Z'],
    ['2026-09-04', 'UTC', '2026-09-04T00:00:00.000Z', '2026-09-05T00:00:00.000Z'],
  ])('%s %s', (d, tz, s, e) => {
    const b = localDayBoundariesUtcMs(d, tz)
    expect(new Date(b.startMs).toISOString()).toBe(s)
    expect(new Date(b.endMs).toISOString()).toBe(e)
  })
})

describe('contract #23/#26 week keys', () => {
  it('Sunday 23:30 local is still the previous week', () => {
    expect(isoWeekStart(Date.UTC(2026, 8, 7, 6, 30), 'America/Los_Angeles')).toBe('2026-08-31')
    expect(isoWeekStart(Date.UTC(2026, 8, 7, 6, 30), 'UTC')).toBe('2026-09-07')
  })
  it('a Sunday→Monday interval touches two weeks; ending at 00:00 touches one', () => {
    const sun2330 = Date.UTC(2026, 8, 6, 13, 30)
    expect(weekKeysTouched({ startMs: sun2330, endMs: sun2330 + 3_600_000 }, 'Australia/Sydney')).toEqual(['2026-08-31', '2026-09-07'])
    expect(weekKeysTouched({ startMs: sun2330, endMs: sun2330 + 1_800_000 }, 'Australia/Sydney')).toEqual(['2026-08-31'])
  })
})

describe('contract #7 trio', () => {
  it('9–12 + 10–11 → wall 180 / effort 240 / premium 60', () => {
    const H = 3_600_000
    expect(computeTrio([{ startMs: 9 * H, endMs: 12 * H }, { startMs: 10 * H, endMs: 11 * H }])).toEqual({ wallClockMin: 180, effortMin: 240, premiumMin: 60 })
  })
})

describe('contract #18 money', () => {
  it('rounds half-up once per grouping; null rate is $0 and 0 rate is $0', () => {
    expect(moneyCents([{ minutes: 1, rateCents: 10000 }])).toBe(167)
    expect(moneyCents([{ minutes: 1, rateCents: 10000 }, { minutes: 1, rateCents: 10000 }])).toBe(333)
    expect(moneyCents([{ minutes: 60, rateCents: null }])).toBe(0)
    expect(moneyCents([{ minutes: 60, rateCents: 0 }])).toBe(0)
  })
})
