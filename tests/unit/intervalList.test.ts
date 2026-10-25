import { describe, expect, it } from 'vitest'
import { clipToDay } from '~/components/intervalList'
import { localDayBoundariesUtcMs } from '~/lib/dayMath'

describe('clipToDay (#23)', () => {
  const day = localDayBoundariesUtcMs('2026-09-02', 'Australia/Perth')

  it('keeps a Perth morning entry whole even though it crosses UTC midnight', () => {
    // 07:00–09:00 Perth = 23:00Z–01:00Z
    expect(clipToDay(Date.UTC(2026, 8, 1, 23), Date.UTC(2026, 8, 2, 1), day)).toEqual({ minutes: 120, crossesDay: false })
  })

  it('clips an entry that runs past local midnight', () => {
    // 22:00–02:00 Perth
    expect(clipToDay(Date.UTC(2026, 8, 2, 14), Date.UTC(2026, 8, 2, 18), day)).toEqual({ minutes: 120, crossesDay: true })
  })
})
