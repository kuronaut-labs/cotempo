import { describe, expect, it } from 'vitest'
import { effectiveJobIds, pace } from '~/lib/allocation'

const structure = [
  {
    projects: [
      { id: 'p1', jobs: [{ id: 'j1', archivedAt: null }, { id: 'j2', archivedAt: new Date(0) }] },
      { id: 'p2', jobs: [{ id: 'j3', archivedAt: null }, { id: 'j4', archivedAt: null }] },
    ],
  },
]

describe('effectiveJobIds', () => {
  it('project assignment expands to its two live jobs, excluding an archived job', () => {
    expect([...effectiveJobIds([{ targetKind: 'project', targetId: 'p1' }], structure)]).toEqual(['j1'])
  })
  it('job assignment yields itself', () => {
    expect([...effectiveJobIds([{ targetKind: 'job', targetId: 'j4' }], structure)]).toEqual(['j4'])
  })
  it('union of many assignments dedupes', () => {
    const ids = effectiveJobIds(
      [
        { targetKind: 'project', targetId: 'p1' },
        { targetKind: 'job', targetId: 'j1' },
        { targetKind: 'job', targetId: 'j3' },
      ],
      structure,
    )
    expect([...ids].sort()).toEqual(['j1', 'j3'])
  })
})

describe('pace (Task 3.2)', () => {
  const A = { start: '2026-09-01', due: '2026-09-11' }
  it('no allocation → n/a', () => {
    expect(pace(null, 300, A.start, A.due, '2026-09-06')).toBe('n/a')
  })
  it('no due date → n/a', () => {
    expect(pace(600, 300, A.start, null, '2026-09-06')).toBe('n/a')
  })
  it('halfway through the window with half logged → on_track', () => {
    expect(pace(600, 300, A.start, A.due, '2026-09-06')).toBe('on_track')
  })
  it('10% logged at 80% elapsed → behind', () => {
    expect(pace(600, 60, A.start, A.due, '2026-09-09')).toBe('behind')
  })
  it('logged > allocated → over', () => {
    expect(pace(600, 700, A.start, A.due, '2026-09-06')).toBe('over')
  })
  it('today after due with less than allocated → behind', () => {
    expect(pace(600, 300, A.start, A.due, '2026-09-12')).toBe('behind')
  })
})
