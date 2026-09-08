import { describe, expect, it } from 'vitest'
import { explode, recon, type Piece } from '~/lib/attribution'

const iv = (o: Partial<Parameters<typeof explode>[0]> & { startMs: number; endMs: number }) => ({
  id: 'i',
  workerId: 'w1',
  jobId: 'j1',
  clientId: 'c1',
  rateCents: 6000,
  ...o,
})

describe('contract #7 explode at local day boundaries', () => {
  it('LA 23:00→01:00 splits at local midnight into two pieces on the right days', () => {
    // 2026-09-04 23:00 PDT = 06:00Z Sep 5; 2026-09-05 01:00 PDT = 08:00Z Sep 5
    const pieces = explode(iv({ startMs: Date.UTC(2026, 8, 5, 6), endMs: Date.UTC(2026, 8, 5, 8) }), 'America/Los_Angeles')
    expect(pieces.map((p) => [p.day, (p.endMs - p.startMs) / 60_000])).toEqual([
      ['2026-09-04', 60],
      ['2026-09-05', 60],
    ])
  })
  it('Sydney 23:00→01:00 likewise', () => {
    // 2026-09-04 23:00 AEST = 13:00Z Sep 4
    const pieces = explode(iv({ startMs: Date.UTC(2026, 8, 4, 13), endMs: Date.UTC(2026, 8, 4, 15) }), 'Australia/Sydney')
    expect(pieces.map((p) => p.day)).toEqual(['2026-09-04', '2026-09-05'])
  })
  it('an interval inside one day is one piece carrying interval fields', () => {
    const [p, ...rest] = explode(iv({ startMs: Date.UTC(2026, 8, 4, 1), endMs: Date.UTC(2026, 8, 4, 2), rateCents: null }), 'UTC')
    expect(rest).toEqual([])
    expect(p).toMatchObject({ intervalId: 'i', workerId: 'w1', jobId: 'j1', clientId: 'c1', day: '2026-09-04', rateCents: null })
  })
})

const piece = (o: Partial<Piece>): Piece => ({
  intervalId: 'i',
  workerId: 'w1',
  jobId: 'j1',
  clientId: 'c1',
  day: '2026-09-04',
  startMs: 0,
  endMs: 3_600_000,
  rateCents: 6000,
  ...o,
})
const H = 3_600_000

describe('contract #7 recon', () => {
  it('two workers on one client 9–10 give wall-clock 120, not 60 (per-worker union, summed)', () => {
    const r = recon([piece({ workerId: 'w1', startMs: 9 * H, endMs: 10 * H }), piece({ workerId: 'w2', startMs: 9 * H, endMs: 10 * H })])
    expect(r.wallClockMin).toBe(120)
    expect(r.effortMin).toBe(120)
    expect(r.premiumMin).toBe(0)
  })
  it('premium equals the sum of per-worker premiums', () => {
    const r = recon([
      piece({ workerId: 'w1', jobId: 'j1', startMs: 9 * H, endMs: 12 * H }),
      piece({ workerId: 'w1', jobId: 'j2', startMs: 10 * H, endMs: 11 * H }), // +60 premium for w1
      piece({ workerId: 'w2', jobId: 'j1', startMs: 9 * H, endMs: 10 * H }),
      piece({ workerId: 'w2', jobId: 'j3', startMs: 9 * H, endMs: 10 * H }), // +60 premium for w2
    ])
    expect(r).toMatchObject({ effortMin: 360, wallClockMin: 240, premiumMin: 120 })
  })
  it('billable minutes exclude null-rate pieces; cents round once across pieces (#18)', () => {
    const r = recon([
      piece({ startMs: 0, endMs: 60_000, rateCents: 10000 }),
      piece({ startMs: 60_000, endMs: 120_000, rateCents: 10000 }),
      piece({ startMs: 120_000, endMs: 180_000, rateCents: null }),
    ])
    expect(r.effortMin).toBe(3)
    expect(r.billableMin).toBe(2)
    expect(r.cents).toBe(333)
  })
  it('empty recon is all zeros', () => {
    expect(recon([])).toEqual({ wallClockMin: 0, effortMin: 0, premiumMin: 0, billableMin: 0, cents: 0 })
  })
})
