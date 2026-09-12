import { describe, expect, it } from 'vitest'
import {
  activePreset,
  lastWeek,
  rangeLabel,
  thisMonth,
  thisWeek,
} from '~/components/periodSelector'

const TZ = 'Australia/Perth'

describe('thisWeek — Monday to Sunday in tz', () => {
  it('Wed 2026-09-09 → Mon 2026-09-07 to Sun 2026-09-13', () => {
    expect(thisWeek('2026-09-09', TZ)).toEqual({ from: '2026-09-07', to: '2026-09-13' })
  })
  it('Sun 2026-09-13 → still that week (Mon Sep 7 – Sun Sep 13)', () => {
    expect(thisWeek('2026-09-13', TZ)).toEqual({ from: '2026-09-07', to: '2026-09-13' })
  })
  it('Mon 2026-09-07 → that exact week', () => {
    expect(thisWeek('2026-09-07', TZ)).toEqual({ from: '2026-09-07', to: '2026-09-13' })
  })
  it('crosses month boundary: Sun 2026-08-30 → Mon Aug 24 – Sun Aug 30', () => {
    expect(thisWeek('2026-08-30', TZ)).toEqual({ from: '2026-08-24', to: '2026-08-30' })
  })
})

describe('lastWeek — the calendar week before thisWeek', () => {
  it('Wed 2026-09-09 → Mon 2026-08-31 to Sun 2026-09-06', () => {
    expect(lastWeek('2026-09-09', TZ)).toEqual({ from: '2026-08-31', to: '2026-09-06' })
  })
  it('Mon 2026-09-07 → Mon 2026-08-31 to Sun 2026-09-06', () => {
    expect(lastWeek('2026-09-07', TZ)).toEqual({ from: '2026-08-31', to: '2026-09-06' })
  })
})

describe('thisMonth — first to last of the month containing today', () => {
  it('Sep 15 2026 → Sep 1 – Sep 30', () => {
    expect(thisMonth('2026-09-15', TZ)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })
  it('Dec 31 2026 → Dec 1 – Dec 31 (handles 31-day month)', () => {
    expect(thisMonth('2026-12-31', TZ)).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })
  it('Feb 15 2024 → Feb 1 – Feb 29 (leap year)', () => {
    expect(thisMonth('2024-02-15', TZ)).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  })
  it('Feb 15 2025 → Feb 1 – Feb 28 (non-leap)', () => {
    expect(thisMonth('2025-02-15', TZ)).toEqual({ from: '2025-02-01', to: '2025-02-28' })
  })
})

describe('activePreset — matches exactly the current period', () => {
  it('this week', () => {
    expect(activePreset(thisWeek('2026-09-09', TZ), '2026-09-09', TZ)).toBe('thisWeek')
  })
  it('last week', () => {
    expect(activePreset(lastWeek('2026-09-09', TZ), '2026-09-09', TZ)).toBe('lastWeek')
  })
  it('this month', () => {
    expect(activePreset(thisMonth('2026-09-15', TZ), '2026-09-15', TZ)).toBe('thisMonth')
  })
  it('arbitrary range → custom', () => {
    expect(activePreset({ from: '2026-08-01', to: '2026-08-15' }, '2026-09-09', TZ)).toBe('custom')
  })
})

describe('rangeLabel — drops the year when same as today', () => {
  it('same year, different month', () => {
    expect(rangeLabel({ from: '2026-09-01', to: '2026-09-30' }, '2026-09-15')).toBe('Sep 1 – Sep 30')
  })
  it('same day', () => {
    expect(rangeLabel({ from: '2026-09-15', to: '2026-09-15' }, '2026-09-15')).toBe('Sep 15')
  })
  it('crosses year boundary: shows both years', () => {
    expect(rangeLabel({ from: '2025-12-29', to: '2026-01-04' }, '2026-01-04')).toBe('Dec 29, 2025 – Jan 4')
  })
})
