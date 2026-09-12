import { describe, expect, it } from 'vitest'
import { effortBarPercents } from '~/components/effortBars'
import type { AdminKpis } from '~/server/services/reports'

const series = (rows: { hour: number; effortMin: number; wallClockMin: number }[]): AdminKpis['effortSeries'] => rows

describe('effortBarPercents — scales to the largest hour, splits wall vs premium', () => {
  it('largest hour fills 100%; smaller hours scale proportionally', () => {
    const rows = effortBarPercents(series([{ hour: 9, effortMin: 60, wallClockMin: 60 }, { hour: 10, effortMin: 30, wallClockMin: 30 }]))
    expect(rows[0]?.wallPct).toBe(100)
    expect(rows[0]?.premiumPct).toBe(0)
    expect(rows[1]?.wallPct).toBe(50)
  })

  it('premium sits in the second half of the bar (wall + premium = effort / max)', () => {
    const rows = effortBarPercents(series([{ hour: 10, effortMin: 60, wallClockMin: 30 }]))
    expect(rows[0]?.wallPct).toBe(50)
    expect(rows[0]?.premiumPct).toBe(50)
  })

  it('zero effort across all hours → empty array (no division by zero)', () => {
    const rows = effortBarPercents(series([{ hour: 9, effortMin: 0, wallClockMin: 0 }]))
    expect(rows).toEqual([])
  })

  it('preserves hour order and exposes effortMin/wallMin for display', () => {
    const rows = effortBarPercents(series([{ hour: 14, effortMin: 45, wallClockMin: 20 }, { hour: 9, effortMin: 45, wallClockMin: 45 }]))
    expect(rows.map((r) => r.hour)).toEqual([14, 9])
    expect(rows[0]).toMatchObject({ effortMin: 45, wallMin: 20 })
  })
})
