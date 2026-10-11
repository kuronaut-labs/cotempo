import { describe, expect, it } from 'vitest'
import { localDayBoundariesUtcMs } from '../../src/lib/dayMath'
import { assignRows, hourTicks, legendItems, stripWindow } from '../../src/lib/stripLayout'

const TZ = 'Australia/Perth'
const DAY = localDayBoundariesUtcMs('2026-09-01', TZ)
const at = (hhmm: string) => DAY.startMs + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))) * 60000

describe('stripWindow', () => {
  it('defaults to 06–22 for a 09–17 day', () => {
    const w = stripWindow(DAY, [{ startMs: at('09:00'), endMs: at('17:00') }], TZ)
    expect(w).toEqual({ startMs: at('06:00'), endMs: at('22:00') })
  })
  it('expands to the hour for an early start', () => {
    const w = stripWindow(DAY, [{ startMs: at('05:30'), endMs: at('08:00') }], TZ)
    expect(w.startMs).toBe(at('05:00'))
  })
  it('stays inside the day', () => {
    const w = stripWindow(DAY, [{ startMs: at('21:00'), endMs: at('23:30') }], TZ)
    expect(w.endMs).toBe(DAY.endMs)
  })
  it('returns the day when empty', () => {
    expect(stripWindow(DAY, [], TZ)).toEqual({ startMs: at('06:00'), endMs: at('22:00') })
  })
})

describe('assignRows', () => {
  it('stacks overlapping blocks in separate rows and reuses rows', () => {
    const rows = assignRows([
      { id: 'a', clippedStart: at('17:00'), clippedEnd: at('20:00') },
      { id: 'b', clippedStart: at('18:00'), clippedEnd: at('19:00') },
      { id: 'c', clippedStart: at('20:00'), clippedEnd: at('21:00') },
    ])
    expect(rows.get('a')).toBe(0)
    expect(rows.get('b')).toBe(1)
    expect(rows.get('c')).toBe(0)
  })
})

describe('hourTicks', () => {
  it('ticks every 2h and labels every 3h across 06–22', () => {
    const w = { startMs: at('06:00'), endMs: at('22:00') }
    const ticks = hourTicks(w, TZ)
    expect(ticks.length).toBe(9) // 06,08,...,22
    expect(ticks[0]!.label).toBe('06:00')
    expect(ticks[1]!.label).toBeNull()
    expect(ticks[3]!.label).toBe('12:00')
    const labelled = ticks.filter((t) => t.label !== null).map((t) => t.label)
    expect(labelled).toEqual(['06:00', '12:00', '18:00'])
    expect(Math.round(ticks.at(-1)!.leftPct)).toBe(100)
  })
})

describe('legendItems', () => {
  it('shows nothing for a plain in-day lane without overlap', () => {
    expect(legendItems([{ leadingClip: '', trailingClip: '' }], 0)).toEqual({
      leading: false,
      trailing: false,
      overlap: false,
    })
  })
  it('explains ‹ only when a block starts before the day', () => {
    expect(legendItems([{ leadingClip: '‹', trailingClip: '' }], 0).leading).toBe(true)
  })
  it('explains › only when a block ends after the day', () => {
    expect(legendItems([{ leadingClip: '', trailingClip: '›' }], 0).trailing).toBe(true)
  })
  it('explains ×N only when overlap regions exist', () => {
    expect(legendItems([{ leadingClip: '', trailingClip: '' }], 2).overlap).toBe(true)
    expect(legendItems([], 0).overlap).toBe(false)
  })
})
