import { describe, expect, it } from 'vitest'
import { dayLabel, myWeekSeries } from '~/components/myWeekChart'

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
})
