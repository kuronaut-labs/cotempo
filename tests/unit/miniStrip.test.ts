import { describe, expect, it } from 'vitest'
import { stripBlocks } from '~/components/miniStrip'

const day = { startMs: 0, endMs: 24 * 60 * 60 * 1000 } // 24h
const hrs = (h: number, m = 0) => (h * 60 + m) * 60 * 1000

describe('stripBlocks', () => {
  it('returns no blocks when no intervals', () => {
    expect(stripBlocks(day, [])).toEqual({ blocks: [], overlaps: [] })
  })

  it('drops intervals that fall outside the day on both sides', () => {
    const layout = stripBlocks(day, [
      { id: 'before', jobId: 'j1', startMs: -1, endMs: -1 },
      { id: 'after', jobId: 'j1', startMs: 25 * 60 * 60 * 1000, endMs: 26 * 60 * 60 * 1000 },
    ])
    expect(layout.blocks).toEqual([])
  })

  it('clips a midnight-crossing interval to the day', () => {
    const layout = stripBlocks(day, [{ id: 'a', jobId: 'j1', startMs: hrs(22), endMs: hrs(26) }])
    expect(layout.blocks).toHaveLength(1)
    const b = layout.blocks[0]!
    expect(b.clippedStart).toBe(hrs(22))
    expect(b.clippedEnd).toBe(hrs(24))
    expect(b.leadingClip).toBe('')
    expect(b.trailingClip).toBe('›')
    expect(b.widthPct).toBeCloseTo((2 / 24) * 100)
  })

  it('marks leading clip when interval starts before the day', () => {
    const layout = stripBlocks(day, [{ id: 'a', jobId: 'j1', startMs: hrs(-2), endMs: hrs(2) }])
    expect(layout.blocks[0]!.leadingClip).toBe('‹')
    expect(layout.blocks[0]!.trailingClip).toBe('')
  })

  it('positions a 09:00–10:00 interval at 37.5–41.66…% of the day', () => {
    const layout = stripBlocks(day, [{ id: 'a', jobId: 'j1', startMs: hrs(9), endMs: hrs(10) }])
    expect(layout.blocks[0]!.leftPct).toBeCloseTo(37.5)
    expect(layout.blocks[0]!.widthPct).toBeCloseTo(4.1666, 3)
  })

  it('emits an overlap region with count = 2 when two intervals cross', () => {
    const layout = stripBlocks(day, [
      { id: 'a', jobId: 'j1', startMs: hrs(9), endMs: hrs(12) },
      { id: 'b', jobId: 'j2', startMs: hrs(10), endMs: hrs(14) },
    ])
    expect(layout.overlaps).toHaveLength(1)
    expect(layout.overlaps[0]).toMatchObject({
      startMs: hrs(10),
      endMs: hrs(12),
      count: 2,
    })
    expect(layout.overlaps[0]!.leftPct).toBeCloseTo((10 / 24) * 100)
    expect(layout.overlaps[0]!.widthPct).toBeCloseTo((2 / 24) * 100)
  })

  it('emits one overlap region per island of overlap', () => {
    const layout = stripBlocks(day, [
      { id: 'a', jobId: 'j1', startMs: hrs(8), endMs: hrs(10) },
      { id: 'b', jobId: 'j2', startMs: hrs(9), endMs: hrs(11) }, // overlap 9-10
      { id: 'c', jobId: 'j3', startMs: hrs(12), endMs: hrs(14) }, // separate
      { id: 'd', jobId: 'j4', startMs: hrs(13), endMs: hrs(15) }, // overlap with c 13-14
    ])
    expect(layout.overlaps).toHaveLength(2)
    expect(layout.overlaps[0]).toMatchObject({ startMs: hrs(9), endMs: hrs(10), count: 2 })
    expect(layout.overlaps[1]).toMatchObject({ startMs: hrs(13), endMs: hrs(14), count: 2 })
  })

  it('returns no overlaps when intervals do not touch', () => {
    const layout = stripBlocks(day, [
      { id: 'a', jobId: 'j1', startMs: hrs(9), endMs: hrs(10) },
      { id: 'b', jobId: 'j2', startMs: hrs(11), endMs: hrs(12) },
    ])
    expect(layout.overlaps).toEqual([])
  })

  it('emits overlapping regions with count 2, 3, 2 across three intervals', () => {
    //        10 ───── 13 (a)
    //              11 ───── 14 (b)
    //                   12 ───── 15 (c)
    //   overlap: 11-12 (×2), 12-13 (×3), 13-14 (×2)
    const layout = stripBlocks(day, [
      { id: 'a', jobId: 'j1', startMs: hrs(10), endMs: hrs(13) },
      { id: 'b', jobId: 'j2', startMs: hrs(11), endMs: hrs(14) },
      { id: 'c', jobId: 'j3', startMs: hrs(12), endMs: hrs(15) },
    ])
    expect(layout.overlaps).toHaveLength(3)
    expect(layout.overlaps[0]).toMatchObject({ startMs: hrs(11), endMs: hrs(12), count: 2 })
    expect(layout.overlaps[1]).toMatchObject({ startMs: hrs(12), endMs: hrs(13), count: 3 })
    expect(layout.overlaps[2]).toMatchObject({ startMs: hrs(13), endMs: hrs(14), count: 2 })
  })

  it('merges touching same-count runs into one region with full width (#M12)', () => {
    //   a: 09–12   b: 10–14   c: 12–15
    //   Sweep: 10–12 is a∩b (×2), then at 12 a ends and c starts (net 0),
    //   so the ×2 run continues uninterrupted to 14 (b∩c). Two touching
    //   same-count runs must merge into one region spanning 10–14. Pre-fix,
    //   the merged width was measured from the merge point (12) instead of
    //   the region's start (10), rendering it at half width.
    const layout = stripBlocks(day, [
      { id: 'a', jobId: 'j1', startMs: hrs(9), endMs: hrs(12) },
      { id: 'b', jobId: 'j2', startMs: hrs(10), endMs: hrs(14) },
      { id: 'c', jobId: 'j3', startMs: hrs(12), endMs: hrs(15) },
    ])
    expect(layout.overlaps).toHaveLength(1)
    const o = layout.overlaps[0]!
    expect(o.startMs).toBe(hrs(10))
    expect(o.endMs).toBe(hrs(14))
    expect(o.count).toBe(2)
    expect(o.leftPct).toBeCloseTo((10 / 24) * 100)
    expect(o.widthPct).toBeCloseTo((4 / 24) * 100)
  })

  it('preserves stable leftPct/widthPct within rounding', () => {
    const layout = stripBlocks(day, [{ id: 'a', jobId: 'j1', startMs: hrs(0, 1), endMs: hrs(0, 2) }])
    expect(layout.blocks[0]!.leftPct).toBeGreaterThan(0)
    expect(layout.blocks[0]!.leftPct).toBeLessThan(1)
  })
})
