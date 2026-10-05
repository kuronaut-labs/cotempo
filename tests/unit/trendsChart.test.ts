import { describe, expect, it } from 'vitest'
import { formatWeekLabel } from '~/lib/dayMath'
import { trendSeries } from '~/components/trendsChart'

describe('trendSeries', () => {
  it('maps each week to its label and stacked minutes', () => {
    const out = trendSeries([
      { weekStart: '2026-09-28', wallClockMin: 1200, effortMin: 1500, premiumMin: 300, utilization: 0.5 },
    ])
    expect(out).toEqual([{ label: formatWeekLabel('2026-09-28'), wallClockMin: 1200, premiumMin: 300 }])
  })
})
