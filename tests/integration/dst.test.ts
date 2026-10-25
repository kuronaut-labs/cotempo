import { beforeEach, describe, expect, it } from 'vitest'
import { asUser, deps, resetDb } from './helpers'
import { ids } from '~/server/fixtures/demo'
import { createInterval } from '~/server/services/intervals'
import { adminKpis, weeklyTrends } from '~/server/services/reports'
import { getWeekForApproval } from '~/server/services/approvals'

// Sydney springs forward on Sun 2026-10-04 (02:00 → 03:00), so that day is 23h and its week 167h.
const sydney = (now = new Date('2026-10-07T02:00:00Z')) => ({ ...deps(now), tz: 'Australia/Sydney' })
const iso = (h: number, m = 0, day = 4) => new Date(Date.UTC(2026, 9, day, h, m)).toISOString()

beforeEach(resetDb)

describe('week and hour math in a DST zone (#23)', () => {
  it('weeklyTrends labels every week by its Monday', async () => {
    const weeks = await weeklyTrends(sydney(), asUser('billing'), { weeks: 3 })
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05'])
  })

  it('adminKpis bins by local hour on a 23-hour day', async () => {
    // 23:00–24:00 AEDT on Oct 4 = 12:00–13:00Z
    await createInterval(sydney(), asUser('operator'), { workerId: ids.opWorker, jobId: ids.j2, startedAt: iso(12), endedAt: iso(13) })
    const k = await adminKpis(sydney(), asUser('billing'), { date: '2026-10-04' })
    expect(k.effortSeries).toEqual([{ hour: 23, effortMin: 60, wallClockMin: 60 }])
  })

  it('an entry at 00:00 Monday belongs to the new week, not the DST week before it', async () => {
    // Mon 2026-10-05 00:00–00:30 AEDT = Oct 4 13:00–13:30Z
    await createInterval(sydney(), asUser('operator'), { workerId: ids.opWorker, jobId: ids.j2, startedAt: iso(13), endedAt: iso(13, 30) })
    const dstWeek = await getWeekForApproval(sydney(), asUser('billing'), { workerId: ids.opWorker, weekStart: '2026-09-28' })
    expect(dstWeek.intervals).toEqual([])
    const next = await getWeekForApproval(sydney(), asUser('billing'), { workerId: ids.opWorker, weekStart: '2026-10-05' })
    expect(next.intervals.map((i) => i.minutes)).toEqual([30])
  })
})
