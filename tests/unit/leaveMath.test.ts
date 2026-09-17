import { describe, expect, it } from 'vitest'
import {
  accrualYears, carryOverMinutes, computeAvailableMinutes, daysInclusive,
  grantedMinutes, requestMinutes, type LeavePolicy,
} from '~/lib/leaveMath'

const annual20d: LeavePolicy = { key: 'annual', accrualMethod: 'monthly_prorata', minutesPerYear: 20 * 480, accrualRatePer10k: 0, maxCarryOverMinutes: 5 * 480, yearBasis: 'calendar' }
const sick10d: LeavePolicy = { key: 'sick', accrualMethod: 'annual_allotment', minutesPerYear: 10 * 480, accrualRatePer10k: 0, maxCarryOverMinutes: 0, yearBasis: 'anniversary' }
const ukPartTime: LeavePolicy = { key: 'annual', accrualMethod: 'per_hours_worked', minutesPerYear: 0, accrualRatePer10k: 1207, maxCarryOverMinutes: 0, yearBasis: 'calendar' }

describe('accrualYears', () => {
  it('calendar basis snaps to Jan 1', () => {
    expect(accrualYears(annual20d, '2025-07-15', '2026-03-10')).toEqual([
      { startDay: '2025-01-01', endDay: '2025-12-31' },
      { startDay: '2026-01-01', endDay: '2026-12-31' },
    ])
  })
  it('anniversary basis uses the start day', () => {
    expect(accrualYears(sick10d, '2025-03-01', '2026-04-02')).toEqual([
      { startDay: '2025-03-01', endDay: '2026-02-28' },
      { startDay: '2026-03-01', endDay: '2027-02-28' },
    ])
  })
  it('stops at asOf year', () => {
    const ys = accrualYears(annual20d, '2024-02-01', '2026-09-17')
    expect(ys.at(-1)?.startDay).toBe('2026-01-01')
    expect(ys).toHaveLength(3)
  })
})

describe('grantedMinutes', () => {
  it('annual_allotment grants the full year once the window began', () => {
    expect(grantedMinutes(sick10d, '2026-03-01', '2025-03-01', '2026-03-02', 0)).toBe(10 * 480)
  })
  it('monthly_prorata grants only completed months', () => {
    expect(grantedMinutes(annual20d, '2026-01-01', '2025-07-15', '2026-04-01', 0)).toBe(Math.floor((20 * 480 * 3) / 12))
    expect(grantedMinutes(annual20d, '2026-01-01', '2025-07-15', '2026-01-31', 0)).toBe(0)
  })
  it('per_hours_worked scales worked minutes', () => {
    expect(grantedMinutes(ukPartTime, '2026-01-01', '2025-07-15', '2026-12-31', 10_000)).toBe(1207)
    expect(grantedMinutes(ukPartTime, '2026-01-01', '2025-07-15', '2026-12-31', 8_280)).toBe(999)
  })
  it('monthly_prorata first year prorates from hire, not Jan 1', () => {
    expect(grantedMinutes(annual20d, '2025-01-01', '2025-07-15', '2025-12-31', 0)).toBe(Math.floor((20 * 480 * 5) / 12))
  })
})

describe('carryOverMinutes + computeAvailableMinutes', () => {
  it('caps carry-over', () => {
    expect(carryOverMinutes(annual20d, 8 * 480)).toBe(5 * 480)
    expect(carryOverMinutes(sick10d, 8 * 480)).toBe(0)
  })
  it('folds years and applies the cap once per boundary', () => {
    // Formula-consistent: Y1 grants floor(9600*5/12)=4000 (hire 2025-07-15 → 5 completed
    // months), used 6000 → nothing available, carry 0; Y2 grants floor(9600*8/12)=6400.
    // (The plan doc's prose 8400 count is inconsistent with its own grantedMinutes tests.)
    const used = [6_000, 0]
    const worked = [0, 0]
    const avail = computeAvailableMinutes(annual20d, '2025-07-15', '2026-09-17', used, worked)
    expect(avail).toBe(6_400)
  })
  it('loses minutes above the carry cap at the boundary', () => {
    // Formula-consistent: Y1/Y2 grant floor(9600*11/12)=8800 (hire Jan 5, 11 completed
    // months); the 2400 carry cap absorbs the surplus at each boundary, so the final
    // answer equals the plan's "full grant" prose: Y3 floor(9600*2/12)=1600 + 2400 = 4000.
    const avail = computeAvailableMinutes(annual20d, '2024-01-05', '2026-03-01', [0, 0], [0, 0])
    expect(avail).toBe(4_000)
  })
  it('per_hours_worked uses worked minutes per year', () => {
    const avail = computeAvailableMinutes(ukPartTime, '2025-01-01', '2026-06-30', [0, 1_207], [10_000, 10_000])
    expect(avail).toBe(0)
  })
})

describe('daysInclusive + requestMinutes', () => {
  it('counts both ends', () => {
    expect(daysInclusive('2026-09-24', '2026-09-25')).toBe(2)
    expect(daysInclusive('2026-09-24', '2026-09-24')).toBe(1)
    expect(daysInclusive('2026-02-27', '2026-03-02')).toBe(4)
  })
  it('multiplies by minutes per day', () => {
    expect(requestMinutes('2026-09-24', '2026-09-25', 480)).toBe(960)
    expect(requestMinutes('2026-09-24', '2026-09-24', 240)).toBe(240)
  })
})
