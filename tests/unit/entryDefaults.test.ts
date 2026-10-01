import { describe, expect, it } from 'vitest'
import { crossesMidnight, durationBetween, endFromDuration } from '../../src/lib/entryDefaults'

describe('durationBetween', () => {
  it('same-day span', () => {
    expect(durationBetween('09:00', '10:30')).toBe(90)
    expect(durationBetween('17:00', '20:00')).toBe(180)
  })
  it('crosses midnight', () => {
    expect(durationBetween('22:00', '02:00')).toBe(240)
    expect(durationBetween('00:30', '01:30')).toBe(60)
  })
})

describe('endFromDuration', () => {
  it('adds within the day', () => {
    expect(endFromDuration('17:00', 180)).toEqual({ end: '20:00', crossesMidnight: false })
  })
  it('wraps past midnight', () => {
    expect(endFromDuration('22:00', 240)).toEqual({ end: '02:00', crossesMidnight: true })
  })
})

describe('crossesMidnight', () => {
  it('derives from times', () => {
    expect(crossesMidnight('23:00', '01:00')).toBe(true)
    expect(crossesMidnight('09:00', '17:00')).toBe(false)
    expect(crossesMidnight('09:00', '09:00')).toBe(true) // zero span = next day by LD9
  })
})
