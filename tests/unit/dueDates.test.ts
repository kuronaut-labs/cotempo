import { describe, expect, it } from 'vitest'
import { dueStatus, jobDueAfterProject } from '~/lib/dueDates'

describe('dueStatus', () => {
  it('none without a date', () => expect(dueStatus(null, '2026-09-05')).toBe('none'))
  it('overdue strictly before today', () => expect(dueStatus('2026-09-04', '2026-09-05')).toBe('overdue'))
  it('today is soon, not overdue', () => expect(dueStatus('2026-09-05', '2026-09-05')).toBe('soon'))
  it('inside the window is soon', () => expect(dueStatus('2026-09-12', '2026-09-05')).toBe('soon'))
  it('outside the window is ok', () => expect(dueStatus('2026-09-13', '2026-09-05')).toBe('ok'))
  it('window is configurable', () => expect(dueStatus('2026-09-13', '2026-09-05', 10)).toBe('soon'))
})

describe('jobDueAfterProject', () => {
  it('flags a job due after its project', () => expect(jobDueAfterProject('2026-11-01', '2026-10-30')).toBe(true))
  it('never flags when either side is null', () => {
    expect(jobDueAfterProject(null, '2026-10-30')).toBe(false)
    expect(jobDueAfterProject('2026-11-01', null)).toBe(false)
  })
})
