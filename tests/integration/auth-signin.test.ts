import { beforeEach, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { asUser, db, deps, resetDb } from './helpers'
import { getAuth } from '~/server/auth'
import { seedAuthUsers, ids } from '~/server/fixtures/demo'
import * as schema from '../../drizzle/schema'
import { archiveWorker } from '~/server/services/workers'

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

it('archiving an admin revokes their BetterAuth admin role, sessions and sign-in', async () => {
  await db.delete(schema.humanWorkers)
  await db.delete(schema.user)
  const auth = getAuth()
  const creds = { email: 'second-admin@example.com', password: 'correct-horse-battery' }
  await seedAuthUsers(db, auth, [{ workerId: ids.billingWorker, name: 'Second Admin', roles: ['operator', 'billing', 'admin'], ...creds }])
  const res = await auth.api.signInEmail({ body: creds })

  await archiveWorker(deps(), asUser('admin'), { workerId: ids.billingWorker })

  const user = await db.select().from(schema.user).where(eq(schema.user.id, res.user.id)).get()
  expect(user).toMatchObject({ role: 'user', banned: true })
  expect(await db.select().from(schema.session).where(eq(schema.session.userId, res.user.id)).all()).toEqual([])
  await expect(auth.api.signInEmail({ body: creds })).rejects.toThrow()
})
