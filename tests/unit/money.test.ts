import { describe, expect, it } from 'vitest'
import { formatDecimalHours, formatHmm, moneyCents } from '~/lib/money'

describe('moneyCents (#18)', () => {
  it('rounds half-up once per grouping', () => {
    expect(moneyCents([{ minutes: 1, rateCents: 10000 }])).toBe(167) // 166.67 → 167
    expect(moneyCents([{ minutes: 1, rateCents: 10000 }, { minutes: 1, rateCents: 10000 }])).toBe(333) // not 334
    expect(moneyCents([{ minutes: 30, rateCents: 1 }])).toBe(1) // 0.5 → 1 (half-up)
  })
  it('null rate is non-billable, zero rate is billable at $0', () => {
    expect(moneyCents([{ minutes: 60, rateCents: null }])).toBe(0)
    expect(moneyCents([{ minutes: 60, rateCents: 0 }])).toBe(0)
    expect(moneyCents([{ minutes: 60, rateCents: 14000 }, { minutes: 60, rateCents: null }])).toBe(14000)
  })
  it('empty is zero', () => expect(moneyCents([])).toBe(0))
})

describe('display formats', () => {
  it('h:mm and h.hh', () => {
    expect(formatHmm(65)).toBe('1:05')
    expect(formatHmm(0)).toBe('0:00')
    expect(formatDecimalHours(330)).toBe('5.50')
    expect(formatDecimalHours(108)).toBe('1.80')
  })
})
