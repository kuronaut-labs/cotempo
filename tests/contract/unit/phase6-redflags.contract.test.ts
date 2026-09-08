import { describe, expect, it } from 'vitest'
import { explode, type Piece } from '~/lib/attribution'
import { redFlags, type RedFlagInput } from '~/lib/redFlags'
import { perthMs } from '../_util'

const TZ = 'Australia/Perth'
const WEEK = '2026-08-31'
const DAYS = ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']
const worker = { id: 'w', supervisorId: 'sup' }

type Iv = RedFlagInput['intervals'][number]
const clean = (): Iv[] =>
  DAYS.map((d, i) => ({
    id: `iv${i}`,
    startedAt: perthMs(d, '09:00'),
    endedAt: perthMs(d, '17:00'),
    createdAt: perthMs(d, '17:05'),
    editCount: 0,
    createdBy: 'w',
  }))

const piecesOf = (ivs: Iv[]): Piece[] =>
  ivs.flatMap((iv) => explode({ id: iv.id, workerId: 'w', jobId: 'j', clientId: 'c', startMs: iv.startedAt, endMs: iv.endedAt, rateCents: 1 }, TZ))

const run = (intervals: Iv[]) => redFlags({ weekStart: WEEK, tz: TZ, worker, intervals, pieces: piecesOf(intervals) })
const kinds = (intervals: Iv[]) => run(intervals).map((f) => f.kind)

describe('contract #12/#17 red flags', () => {
  it('a clean 5×8h week entered same-day by the worker has no flags', () => {
    expect(run(clean())).toEqual([])
  })
  it('gap: a weekday with no time, or under 8h wall-clock', () => {
    expect(kinds(clean().slice(0, 4))).toEqual(['gap'])
    const short = clean()
    short[2]!.endedAt = perthMs('2026-09-02', '12:00')
    expect(kinds(short)).toEqual(['gap'])
  })
  it('gap never fires for Saturday or Sunday', () => {
    expect(kinds(clean())).not.toContain('gap')
  })
  it('late_entry: created more than 7 days after the week ended', () => {
    const ivs = clean()
    ivs[0]!.createdAt = perthMs('2026-09-15', '09:00')
    expect(kinds(ivs)).toContain('late_entry')
    ivs[0]!.createdAt = perthMs('2026-09-13', '09:00')
    expect(kinds(ivs)).not.toContain('late_entry')
  })
  it('multi_edit: more than 2 edits', () => {
    const ivs = clean()
    ivs[1]!.editCount = 3
    expect(kinds(ivs)).toEqual(['multi_edit'])
    ivs[1]!.editCount = 2
    expect(kinds(ivs)).toEqual([])
  })
  it('retroactive: created on a later local day than it started; same-day evening entry is fine', () => {
    const ivs = clean()
    ivs[3]!.createdAt = perthMs('2026-09-04', '08:00')
    expect(kinds(ivs)).toEqual(['retroactive'])
    // created at 23:59 the same day → fine; retroactive flags carry the interval id
    ivs[3]!.createdAt = perthMs('2026-09-03', '23:59')
    expect(kinds(ivs)).toEqual([])
  })
  it('non_supervisor: entered by someone other than the worker or their supervisor', () => {
    const ivs = clean()
    ivs[4]!.createdBy = 'sup'
    expect(kinds(ivs)).toEqual([])
    ivs[4]!.createdBy = 'someone-else'
    const flags = run(ivs)
    expect(flags).toHaveLength(1)
    expect(flags[0]).toMatchObject({ kind: 'non_supervisor', intervalId: 'iv4' })
  })
})
