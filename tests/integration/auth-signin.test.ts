import { beforeEach, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, resetDb } from './helpers'
import { getAuth } from '~/server/auth'
import { seedAuthUsers, ids } from '~/server/fixtures/demo'
import * as schema from '../../drizzle/schema'

beforeEach(resetDb)

// The one place BetterAuth's credential path runs against D1 in CI (#21).
it('seeded admin can sign in and gets a session row', async () => {
  await db.delete(schema.humanWorkers)
  await db.delete(schema.user)
  const auth = getAuth()
  await seedAuthUsers(db, auth, [
    { workerId: ids.adminWorker, email: 'admin@example.com', name: 'Admin', password: 'correct-horse-battery', roles: ['operator', 'billing', 'admin'] },
  ])

  const res = await auth.api.signInEmail({ body: { email: 'admin@example.com', password: 'correct-horse-battery' } })
  expect(res.user.email).toBe('admin@example.com')

  const sessions = await db.select().from(schema.session).where(eq(schema.session.userId, res.user.id)).all()
  expect(sessions).toHaveLength(1)
})

it('sign-up is disabled (#8)', async () => {
  const auth = getAuth()
  await expect(
    auth.api.signUpEmail({ body: { email: 'new@example.com', password: 'correct-horse-battery', name: 'New' } }),
  ).rejects.toThrow()
})
