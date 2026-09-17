import { describe, expect, it } from 'vitest'
import { barPercents } from '~/components/reconBars'
import type { ReconciliationReport } from '~/server/services/reports'

const recon = (wall: number, effort: number) => ({ wallClockMin: wall, effortMin: effort, premiumMin: effort - wall, billableMin: effort, cents: 0 })

const report = (clients: { clientId: string; name: string; wall: number; effort: number }[]): ReconciliationReport => ({
  clients: clients.map((c) => ({ clientId: c.clientId, name: c.name, ...recon(c.wall, c.effort) })),
  total: recon(clients.reduce((s, c) => s + c.wall, 0), clients.reduce((s, c) => s + c.effort, 0)),
})

describe('barPercents — scales to the largest effort', () => {
  it('largest client fills 100% wall; smaller clients scale proportionally', () => {
    const r = report([
      { clientId: 'a', name: 'A', wall: 60, effort: 60 },
      { clientId: 'b', name: 'B', wall: 30, effort: 30 },
    ])
    const pcts = barPercents(r)
    const a = pcts.get('a')!
    const b = pcts.get('b')!
    expect(a.wallPct).toBe(100)
    expect(a.premiumPct).toBe(0)
    expect(b.wallPct).toBe(50)
    expect(b.premiumPct).toBe(0)
  })

  it('premium extension is rendered as a separate pct from wall', () => {
    const r = report([{ clientId: 'a', name: 'A', wall: 30, effort: 60 }])
    const pcts = barPercents(r)
    const a = pcts.get('a')!
    expect(a.wallPct).toBe(50)
    expect(a.premiumPct).toBe(50)
  })

  it('premium sits immediately after wall (wall + premium = effort/maxEffort * 100)', () => {
    const r = report([
      { clientId: 'a', name: 'A', wall: 30, effort: 60 },
      { clientId: 'b', name: 'B', wall: 60, effort: 60 },
    ])
    const a = barPercents(r).get('a')!
    const b = barPercents(r).get('b')!
    expect(a.wallPct + a.premiumPct).toBeCloseTo(100, 6)
    expect(b.wallPct + b.premiumPct).toBe(100)
  })

  it('empty report returns an empty map (no division by zero)', () => {
    const r: ReconciliationReport = { clients: [], total: recon(0, 0) }
    expect(barPercents(r).size).toBe(0)
  })

  it('all-zero report (everyone has 0 effort) returns empty', () => {
    const r = report([{ clientId: 'a', name: 'A', wall: 0, effort: 0 }])
    expect(barPercents(r).size).toBe(0)
  })
})
