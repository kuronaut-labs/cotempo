import { describe, expect, it } from 'vitest'
import { isMonday, isoWeekStart, weekDates, weekKeysTouched } from '~/lib/week'

describe('isoWeekStart (#23)', () => {
  it('uses the org zone, not UTC', () => {
    // 2026-09-06 23:30 Sydney (Sun) = 2026-09-06T13:30Z → week of 2026-08-31
    expect(isoWeekStart(Date.UTC(2026, 8, 6, 13, 30), 'Australia/Sydney')).toBe('2026-08-31')
    // 2026-09-06 23:30 LA (Sun) = 2026-09-07T06:30Z → still 2026-08-31 in LA, 2026-09-07 in UTC
    expect(isoWeekStart(Date.UTC(2026, 8, 7, 6, 30), 'America/Los_Angeles')).toBe('2026-08-31')
    expect(isoWeekStart(Date.UTC(2026, 8, 7, 6, 30), 'UTC')).toBe('2026-09-07')
  })
  it('Monday maps to itself; Sunday to the previous Monday', () => {
    expect(isoWeekStart(Date.UTC(2026, 8, 7), 'UTC')).toBe('2026-09-07')
    expect(isoWeekStart(Date.UTC(2026, 8, 13, 23, 59), 'UTC')).toBe('2026-09-07')
  })
})

describe('weekDates / isMonday', () => {
  it('seven consecutive dates', () => {
    expect(weekDates('2026-08-31')).toEqual([
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ])
  })
  it('isMonday', () => {
    expect(isMonday('2026-08-31')).toBe(true)
    expect(isMonday('2026-09-01')).toBe(false)
  })
})

describe('weekKeysTouched (#26)', () => {
  it('crossing Sunday→Monday touches two weeks', () => {
    expect(weekKeysTouched({ startMs: Date.UTC(2026, 8, 6, 13, 30), endMs: Date.UTC(2026, 8, 6, 14, 30) }, 'Australia/Sydney')).toEqual([
      '2026-08-31',
      '2026-09-07',
    ])
  })
  it('ending exactly at Monday 00:00 touches one week', () => {
    expect(weekKeysTouched({ startMs: Date.UTC(2026, 8, 6, 13, 0), endMs: Date.UTC(2026, 8, 6, 14, 0) }, 'Australia/Sydney')).toEqual([
      '2026-08-31',
    ])
  })
})
