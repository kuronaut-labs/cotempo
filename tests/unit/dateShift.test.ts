import { describe, expect, it } from 'vitest'
import { addDays, parseIsoDate, toIsoDate } from '~/lib/dateShift'

describe('dateShift', () => {
  it('parseIsoDate / toIsoDate round-trip', () => {
    expect(toIsoDate(parseIsoDate('2026-09-02'))).toBe('2026-09-02')
    expect(toIsoDate(parseIsoDate('2026-12-31'))).toBe('2026-12-31')
    expect(toIsoDate(parseIsoDate('2026-01-01'))).toBe('2026-01-01')
  })

  it('addDays shifts across DST-safe UTC boundaries', () => {
    expect(toIsoDate(addDays(parseIsoDate('2026-09-02'), 1))).toBe('2026-09-03')
    expect(toIsoDate(addDays(parseIsoDate('2026-09-02'), -1))).toBe('2026-09-01')
    expect(toIsoDate(addDays(parseIsoDate('2026-08-31'), 7))).toBe('2026-09-07')
    expect(toIsoDate(addDays(parseIsoDate('2026-09-06'), 1))).toBe('2026-09-07')
  })
})
