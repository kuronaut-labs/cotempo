import { describe, expect, it } from 'vitest'
import { humanOptions, nextRoles, rolesFromChecks } from '~/components/workerRoster'
import type { WorkerView } from '~/server/services/workers'

const human = (over: Partial<Extract<WorkerView, { kind: 'human' }>>): WorkerView => ({
  workerId: 'w',
  kind: 'human',
  name: 'N',
  email: 'e@x.co',
  roles: ['operator'],
  supervisorId: null,
  inviteState: 'active',
  ...over,
})

const agent = (over: Partial<Extract<WorkerView, { kind: 'agent' }>>): WorkerView => ({
  workerId: 'a',
  kind: 'agent',
  name: 'A',
  model: 'm',
  framework: 'f',
  status: 'active',
  supervisorId: null,
  ...over,
})

describe('nextRoles (#5: operator baseline is locked on)', () => {
  it('toggles billing on', () => {
    expect(nextRoles(['operator'], 'billing', true)).toEqual(['operator', 'billing'])
  })

  it('toggles billing off', () => {
    expect(nextRoles(['operator', 'billing'], 'billing', false)).toEqual(['operator'])
  })

  it('ignores operator toggles entirely', () => {
    expect(nextRoles(['operator'], 'operator', false)).toEqual(['operator'])
    expect(nextRoles(['operator'], 'operator', true)).toEqual(['operator'])
  })

  it('returns roles in schema order regardless of input order', () => {
    expect(nextRoles(['admin', 'operator'], 'billing', true)).toEqual(['operator', 'billing', 'admin'])
  })
})

describe('rolesFromChecks', () => {
  it('always includes operator', () => {
    expect(rolesFromChecks(false, false)).toEqual(['operator'])
  })

  it('adds billing and admin when checked', () => {
    expect(rolesFromChecks(true, true)).toEqual(['operator', 'billing', 'admin'])
  })
})

describe('humanOptions', () => {
  it('lists only humans as value/label pairs', () => {
    const ws = [human({ workerId: 'h1', name: 'Ravi' }), agent({ workerId: 'a1', name: 'Atlas' })]
    expect(humanOptions(ws)).toEqual([{ value: 'h1', label: 'Ravi' }])
  })
})
