import { describe, expect, it } from 'vitest'
import { CreateIntervalInput, UpdateIntervalInput, ListIntervalsInput } from '~/lib/schemas/intervals'
import { CreateJobInput } from '~/lib/schemas/structure'
import { InviteInput, SetRolesInput } from '~/lib/schemas/workers'
import { PeriodInput } from '~/lib/schemas/reports'

const base = { workerId: 'w', jobId: 'j', startedAt: '2026-09-04T14:00:00.000Z', endedAt: '2026-09-04T15:00:00.000Z' }

describe('interval inputs (#22)', () => {
  it('accepts minute-aligned ISO instants', () => {
    expect(CreateIntervalInput.safeParse(base).success).toBe(true)
  })
  it('rejects sub-minute timestamps with MINUTE_ALIGNMENT on the field', () => {
    const r = CreateIntervalInput.safeParse({ ...base, startedAt: '2026-09-04T14:00:30.000Z' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('MINUTE_ALIGNMENT')
      expect(r.error.issues[0]?.path).toEqual(['startedAt'])
    }
  })
  it('rejects end <= start with END_BEFORE_START on endedAt', () => {
    const r = CreateIntervalInput.safeParse({ ...base, endedAt: base.startedAt })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('END_BEFORE_START')
      expect(r.error.issues[0]?.path).toEqual(['endedAt'])
    }
  })
  it('has no rate field: the server snapshots it (#18)', () => {
    const r = CreateIntervalInput.safeParse({ ...base, rateCents: 100 })
    expect(r.success).toBe(true)
    if (r.success) expect('rateCents' in r.data).toBe(false)
  })
  it('update allows partial times but still checks order when both given', () => {
    expect(UpdateIntervalInput.safeParse({ id: 'i', endedAt: base.endedAt }).success).toBe(true)
    expect(UpdateIntervalInput.safeParse({ id: 'i', startedAt: base.endedAt, endedAt: base.startedAt }).success).toBe(false)
  })
  it('list limit defaults 50, max 200 (#10)', () => {
    expect(ListIntervalsInput.parse({}).limit).toBe(50)
    expect(ListIntervalsInput.safeParse({ limit: 201 }).success).toBe(false)
  })
})

describe('job rate (#18)', () => {
  it('accepts null and 0, rejects negative and fractional', () => {
    expect(CreateJobInput.safeParse({ projectId: 'p', name: 'n', billableRateCents: null }).success).toBe(true)
    expect(CreateJobInput.safeParse({ projectId: 'p', name: 'n', billableRateCents: 0 }).success).toBe(true)
    expect(CreateJobInput.safeParse({ projectId: 'p', name: 'n', billableRateCents: -1 }).success).toBe(false)
    expect(CreateJobInput.safeParse({ projectId: 'p', name: 'n', billableRateCents: 10.5 }).success).toBe(false)
  })
})

describe('roles (#5)', () => {
  it('every human must keep operator', () => {
    expect(InviteInput.safeParse({ email: 'a@b.co', name: 'A', roles: ['billing'] }).success).toBe(false)
    expect(InviteInput.safeParse({ email: 'a@b.co', name: 'A', roles: ['operator', 'billing'] }).success).toBe(true)
    expect(SetRolesInput.safeParse({ workerId: 'w', roles: ['admin'] }).success).toBe(false)
  })
})

describe('period', () => {
  it('to must not precede from', () => {
    expect(PeriodInput.safeParse({ from: '2026-09-07', to: '2026-09-01' }).success).toBe(false)
    expect(PeriodInput.safeParse({ from: '2026-09-01', to: '2026-09-01' }).success).toBe(true)
  })
})
