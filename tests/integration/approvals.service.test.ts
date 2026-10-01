import { beforeEach, describe, expect, it } from 'vitest'
import { ids } from '~/server/fixtures/demo'
import { weekDates } from '~/lib/week'
import { weeksWithEntries } from '~/server/services/approvals'
import { asUser, deps, resetDb } from './helpers'

describe('weeksWithEntries', () => {
  beforeEach(() => resetDb())

  it('returns the seeded week (the week containing the demo anchor) and no empty weeks', async () => {
    const tz = deps().tz
    // seed data sits in the week of the anchor; probe that week and one before/after
    const before = ['2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07']
    const out = await weeksWithEntries(deps(), asUser('operator'), { workerId: ids.opWorker, weekStarts: before })
    expect(out).toEqual(['2026-08-31'])
    expect(weekDates(out[0]!).length).toBe(7)
    void tz
  })

  it('views someone else only within scope', async () => {
    await expect(
      weeksWithEntries(deps(), asUser('operator'), { workerId: ids.billingWorker, weekStarts: ['2026-08-31'] }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN_TARGET' })
  })
})
