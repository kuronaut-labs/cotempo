import { describe, expect, it } from 'vitest'
import { overtimeByProject, totalOvertimeMin } from '~/lib/overtime'
import type { Piece } from '~/lib/attribution'

const DAY = '2026-09-01'
const mk = (workerId: string, jobId: string, startHour: number, endHour: number, day = DAY): Piece => ({
  intervalId: `${workerId}-${jobId}-${startHour}`,
  workerId,
  jobId,
  clientId: 'c1',
  day,
  startMs: Date.UTC(2026, 8, day === DAY ? 1 : 2, startHour),
  endMs: Date.UTC(2026, 8, day === DAY ? 1 : 2, endHour),
  rateCents: null,
})

const JOBS = { a: 'job-a', b: 'job-b' }
const projectA = new Set([JOBS.a])

describe('overtimeByProject (Task 3.1)', () => {
  it('attributes all overtime to a single project', () => {
    const rows = overtimeByProject([mk('w1', JOBS.a, 8, 18)], projectA, 480)
    expect(rows).toEqual([{ workerId: 'w1', day: DAY, wallClockMin: 600, overtimeMin: 120, attributedMin: 120 }])
    expect(totalOvertimeMin(rows)).toBe(120)
  })

  it('splits overtime across two projects by effort', () => {
    const rows = overtimeByProject(
      [mk('w1', JOBS.a, 6, 12), mk('w1', JOBS.b, 12, 18)],
      projectA,
      480,
    )
    expect(rows).toEqual([{ workerId: 'w1', day: DAY, wallClockMin: 720, overtimeMin: 240, attributedMin: 120 }])
  })

  it('overlapping jobs across projects produce no overtime (unioned wall)', () => {
    const rows = overtimeByProject(
      [mk('w1', JOBS.a, 9, 17), mk('w1', JOBS.b, 9, 17)],
      projectA,
      480,
    )
    expect(rows).toEqual([])
  })

  it('a 24h day for an agent yields 960 overtime minutes', () => {
    const pieces: Piece[] = [{ ...mk('ag', JOBS.a, 0, 12), startMs: Date.UTC(2026, 8, 1, 0), endMs: Date.UTC(2026, 8, 2, 0) }]
    const rows = overtimeByProject(pieces, projectA, 480)
    expect(rows).toEqual([{ workerId: 'ag', day: DAY, wallClockMin: 1440, overtimeMin: 960, attributedMin: 960 }])
  })

  it('is scoped to the selected project', () => {
    const rows = overtimeByProject([mk('w1', JOBS.b, 6, 18)], projectA, 480)
    expect(rows).toEqual([])
  })

  it('keeps other days independent and attributes per day', () => {
    const tomorrow = mk('w1', JOBS.a, 6, 20, '2026-09-02')
    const r = overtimeByProject([mk('w1', JOBS.a, 8, 18), tomorrow], projectA, 480)
    expect(r.map((x) => x.day)).toEqual([DAY, '2026-09-02'])
    expect(r[0]!.overtimeMin).toBe(120)
    expect(r[1]!.overtimeMin).toBe(360)
  })
})
