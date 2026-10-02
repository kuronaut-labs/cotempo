import { describe, expect, it } from 'vitest'
import { effectiveJobIds } from '~/lib/allocation'

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
