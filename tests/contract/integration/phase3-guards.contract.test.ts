import { beforeEach, describe, expect, it } from 'vitest'
import { asUser, db, resetDb, setWeekStatus } from '../../integration/helpers'
import { ids } from '~/server/fixtures/demo'
import { assertCanEditWorker, assertCanViewWorker } from '~/server/guards/worker'
import { assertWeeksEditable } from '~/server/guards/week'

beforeEach(resetDb)

describe('contract #17 entry rights', () => {
  it('billing gets no entry rights beyond self', () => {
    expect(() => assertCanEditWorker(asUser('billing'), ids.opWorker)).toThrow('FORBIDDEN_TARGET')
    expect(() => assertCanEditWorker(asUser('billing'), ids.billingWorker)).not.toThrow()
  })
  it('admin may enter for anyone', () => {
    expect(() => assertCanEditWorker(asUser('admin'), ids.opWorker)).not.toThrow()
    expect(() => assertCanEditWorker(asUser('admin'), ids.agent1)).not.toThrow()
  })
  it('operator: self and supervisees only', () => {
    expect(() => assertCanEditWorker(asUser('operator'), ids.agent2)).not.toThrow()
    expect(() => assertCanEditWorker(asUser('operator'), ids.adminWorker)).toThrow('FORBIDDEN_TARGET')
  })
})

describe('contract #5 view rights', () => {
  it('billing views anyone; operator cannot view outside scope', () => {
    expect(() => assertCanViewWorker(asUser('billing'), ids.opWorker)).not.toThrow()
    expect(() => assertCanViewWorker(asUser('operator'), ids.billingWorker)).toThrow('FORBIDDEN_TARGET')
  })
})

describe('contract #26 lock semantics', () => {
  it('only approved locks; submitted, rejected, draft and absent weeks are editable', async () => {
    await setWeekStatus(ids.opWorker, '2026-08-31', 'approved')
    await setWeekStatus(ids.opWorker, '2026-09-07', 'submitted')
    await setWeekStatus(ids.opWorker, '2026-09-14', 'rejected')
    await setWeekStatus(ids.opWorker, '2026-09-21', 'draft')
    await expect(assertWeeksEditable(db, ids.opWorker, ['2026-08-31'])).rejects.toMatchObject({ code: 'WEEK_LOCKED', status: 409, data: { weekStart: '2026-08-31' } })
    for (const wk of ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']) await expect(assertWeeksEditable(db, ids.opWorker, [wk])).resolves.toBeUndefined()
  })
})
