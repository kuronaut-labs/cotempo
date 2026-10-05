import { describe, expect, it } from 'vitest'
import { dayLabel, myWeekSeries, weekSeriesBlocked } from '~/components/myWeekChart'

const day = (iso: string, wallClockMin: number, premiumMin: number) => ({
  day: iso,
  trio: { wallClockMin, effortMin: wallClockMin + premiumMin, premiumMin, billableMin: wallClockMin + premiumMin },
  pieces: [],
})

describe('dayLabel', () => {
  it('labels with weekday and day number', () => {
    expect(dayLabel('2026-09-28')).toBe('Mon 28')
    expect(dayLabel('2026-10-04')).toBe('Sun 4')
  })
})

describe('myWeekSeries', () => {
  it('zero-fills absent days across the period', () => {
    const out = myWeekSeries([day('2026-09-29', 240, 30)], '2026-09-28', '2026-10-02')
    expect(out.map((d) => d.day)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
    expect(out[1]).toMatchObject({ label: 'Tue 29', wallClockMin: 240, premiumMin: 30 })
    expect(out[0]).toMatchObject({ wallClockMin: 0, premiumMin: 0 })
  })

  it('returns empty for an inverted range', () => {
    expect(myWeekSeries([], '2026-10-02', '2026-09-28')).toEqual([])
  })

  it('blocks invalid and too-wide ranges so the chart can show a distinct note', () => {
    expect(weekSeriesBlocked('2026-10-02', '2026-09-28')).toBe(true)
    expect(weekSeriesBlocked('2000-01-01', '2100-01-01')).toBe(true)
    expect(weekSeriesBlocked('2026-09-28', '2026-10-02')).toBe(false)
    // 370-day span exactly is allowed; strictly more is blocked.
    expect(weekSeriesBlocked('2025-10-05', '2026-10-10')).toBe(false)
    expect(weekSeriesBlocked('2024-10-05', '2026-10-10')).toBe(true)
  })

  it('blocks non-ISO dates rather than looping wide', () => {
    expect(weekSeriesBlocked('2026-9-28', '2026-10-02')).toBe(true)
  })
})
