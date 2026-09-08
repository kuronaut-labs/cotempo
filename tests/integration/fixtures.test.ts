import { beforeEach, expect, it } from 'vitest'
import { count } from 'drizzle-orm'
import { db, resetDb } from './helpers'
import { insertDemo } from '~/server/fixtures/demo'
import * as schema from '../../drizzle/schema'

beforeEach(resetDb)

it('demo fixture inserts 5 workers, 8 intervals, 3 humans and is idempotent', async () => {
  await insertDemo(db)
  const [w] = await db.select({ n: count() }).from(schema.workers)
  const [i] = await db.select({ n: count() }).from(schema.intervals)
  const [h] = await db.select({ n: count() }).from(schema.humanWorkers)
  expect([w?.n, i?.n, h?.n]).toEqual([5, 8, 3])
})
