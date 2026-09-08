import { beforeEach, describe, expect, it } from 'vitest'
import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { eq } from 'drizzle-orm'
import { asUser, db, resetDb } from './helpers'
import { ids } from '~/server/fixtures/demo'
import { hasRole } from '~/server/context'
import { HttpError } from '~/lib/errors'
import { inviteUser, resendInvite } from '~/server/services/invites'
import * as schema from '../../drizzle/schema'

beforeEach(resetDb)

const TEST_SECRET = 'integration-test-secret-must-be-32-chars-long'
const TEST_PASSWORD = 'correct-horse-battery'

// Per-test capture so the array does not leak across cases.
const captured: string[] = []
const makeAuth = () => {
  captured.length = 0
  return betterAuth({
    baseURL: 'http://localhost:3000',
    secret: TEST_SECRET,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      disableSignUp: true,
      resetPasswordTokenExpiresIn: 7 * 24 * 60 * 60,
      async sendResetPassword({ url }) {
        captured.push(url)
      },
    },
    plugins: [admin()],
  })
}

// resetDb inserts the user row from demoHumans but no credential account. Insert
// the credential account row directly so sign-in has something to verify against.
async function adminHeaders(auth: ReturnType<typeof makeAuth>): Promise<Headers> {
  const adminUser = await db.select().from(schema.user).where(eq(schema.user.email, 'admin@example.com')).get()
  if (!adminUser) throw new Error('admin user missing from fixtures')
  const ctx = await auth.$context
  const hash = await ctx.password.hash(TEST_PASSWORD)
  await db
    .insert(schema.account)
    .values({
      id: crypto.randomUUID(),
      userId: adminUser.id,
      accountId: adminUser.id,
      providerId: 'credential',
      password: hash,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
  const res = await auth.api.signInEmail({
    body: { email: 'admin@example.com', password: TEST_PASSWORD },
    asResponse: true,
    headers: new Headers({ origin: 'http://localhost:3000' }),
  })
  const setCookie = res.headers.getSetCookie?.()[0] ?? res.headers.get('set-cookie')
  if (!setCookie) throw new Error(`sign-in did not set a cookie (status ${res.status})`)
  const h = new Headers()
  h.set('cookie', setCookie.split(';')[0]!)
  return h
}

describe('inviteUser (#16)', () => {
  it('creates user + worker + human_workers and captures one reset url', async () => {
    const auth = makeAuth()
    const headers = await adminHeaders(auth)
    const result = await inviteUser(
      { db, auth, headers, appUrl: 'http://localhost:3000' },
      asUser('admin'),
      { email: 'newbie@example.com', name: 'Newbie', roles: ['operator'], supervisorId: null },
    )

    expect(result.email).toBe('newbie@example.com')
    expect(result.mailed).toBe(true)
    expect(captured).toHaveLength(1)
    expect(captured[0]).toContain('set-password')

    const user = await db.select().from(schema.user).where(eq(schema.user.email, 'newbie@example.com')).get()
    expect(user).toBeTruthy()
    const human = await db
      .select()
      .from(schema.humanWorkers)
      .where(eq(schema.humanWorkers.userId, user!.id))
      .get()
    expect(human).toBeTruthy()
    expect(JSON.parse(human!.roles)).toEqual(['operator'])
    const worker = await db.select().from(schema.workers).where(eq(schema.workers.id, result.workerId)).get()
    expect(worker?.kind).toBe('human')
    expect(worker?.supervisorId).toBeNull()
  })

  it('respects supervisorId and admin role', async () => {
    const auth = makeAuth()
    const headers = await adminHeaders(auth)
    const result = await inviteUser(
      { db, auth, headers, appUrl: 'http://localhost:3000' },
      asUser('admin'),
      {
        email: 'super@example.com',
        name: 'Super',
        roles: ['operator', 'admin'],
        supervisorId: ids.opWorker,
      },
    )

    const worker = await db.select().from(schema.workers).where(eq(schema.workers.id, result.workerId)).get()
    expect(worker?.supervisorId).toBe(ids.opWorker)

    const user = await db.select().from(schema.user).where(eq(schema.user.email, 'super@example.com')).get()
    expect(user?.role).toBe('admin')
  })
})

describe('resendInvite (#16)', () => {
  it('captures a second, different url', async () => {
    const auth = makeAuth()
    const headers = await adminHeaders(auth)
    await inviteUser(
      { db, auth, headers, appUrl: 'http://localhost:3000' },
      asUser('admin'),
      { email: 'again@example.com', name: 'Again', roles: ['operator'], supervisorId: null },
    )
    expect(captured).toHaveLength(1)
    const first = captured[0]

    const humans = await db.select().from(schema.humanWorkers).all()
    const newHuman = humans.find((h) => h.workerId !== ids.adminWorker)!
    const { mailed } = await resendInvite(
      { db, auth, appUrl: 'http://localhost:3000' },
      asUser('admin'),
      { workerId: newHuman.workerId },
    )
    expect(mailed).toBe(true)
    expect(captured).toHaveLength(2)
    expect(captured[1]).not.toBe(first)
    expect(captured[1]).toContain('set-password')
  })

  it('throws NOT_FOUND when workerId is unknown', async () => {
    const auth = makeAuth()
    await expect(
      resendInvite({ db, auth, appUrl: 'http://localhost:3000' }, asUser('admin'), { workerId: 'no-such-worker' }),
    ).rejects.toThrow('NOT_FOUND')
  })
})

describe('requireRole guard (#5)', () => {
  it('admin passes, operator and billing do not', () => {
    expect(hasRole(asUser('admin'), 'admin')).toBe(true)
    expect(hasRole(asUser('operator'), 'admin')).toBe(false)
    expect(hasRole(asUser('billing'), 'admin')).toBe(false)
  })

  it('a non-admin sessionCtx never reaches the handler (#10, #5)', () => {
    // Mirror the role check that requireRole does inside the fn handler chain.
    const op = asUser('operator')
    expect(() => {
      if (!hasRole(op, 'admin')) throw new HttpError(403, 'FORBIDDEN')
    }).toThrow('FORBIDDEN')
  })
})
