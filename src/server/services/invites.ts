import { and, eq, isNull } from 'drizzle-orm'
import type { z } from 'zod'
import { InviteInput, ResendInviteInput } from '~/lib/schemas/workers'
import { HttpError } from '~/lib/errors'
import type { Auth } from '~/server/auth'
import { schema, type Db } from '~/server/db'
import { isAdmin, type SessionContext } from '~/server/context'

type InviteResult = { workerId: string; email: string; mailed: boolean }
type InviteDeps = { db: Db; auth: Auth; headers: Headers; appUrl: string }

async function sendInvite(auth: Auth, email: string, appUrl: string): Promise<boolean> {
  try {
    await auth.api.requestPasswordReset({ body: { email, redirectTo: `${appUrl}/set-password` } })
    return true
  } catch (e) {
    console.error('invite mail failed', e) // invite persists; admin can Resend (#16)
    return false
  }
}

function requireAdmin(ctx: SessionContext) {
  if (!isAdmin(ctx)) throw new HttpError(403, 'FORBIDDEN')
}

/* Admin session is forwarded because the admin plugin refuses createUser without
   one. The random password is never sent anywhere; the reset token is the invite. */
export async function inviteUser(
  deps: InviteDeps,
  ctx: SessionContext,
  input: z.infer<typeof InviteInput>,
): Promise<InviteResult> {
  requireAdmin(ctx)
  const { db, auth, headers, appUrl } = deps

  // Everything that can fail is checked before createUser, so no orphan auth user is left behind.
  const taken = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, input.email)).get()
  if (taken) throw new HttpError(409, 'EMAIL_TAKEN', 'email')
  if (input.supervisorId) {
    const sup = await db
      .select({ kind: schema.workers.kind })
      .from(schema.workers)
      .where(and(eq(schema.workers.id, input.supervisorId), isNull(schema.workers.archivedAt)))
      .get()
    if (!sup || sup.kind !== 'human') throw new HttpError(400, 'SUPERVISOR_NOT_HUMAN', 'supervisorId')
  }

  const discarded = crypto.randomUUID() + crypto.randomUUID()
  const created = await auth.api.createUser({
    headers,
    body: {
      email: input.email,
      name: input.name,
      password: discarded,
      role: input.roles.includes('admin') ? 'admin' : 'user',
    },
  })
  const userId = created?.user?.id
  if (!userId) throw new HttpError(500, 'CREATE_USER_FAILED')

  const workerId = crypto.randomUUID()
  const now = new Date()
  try {
    await db.batch([
      db.insert(schema.workers).values({
        id: workerId,
        kind: 'human',
        supervisorId: input.supervisorId ?? null,
        createdAt: now,
      }),
      db.insert(schema.humanWorkers).values({ workerId, userId, roles: JSON.stringify(input.roles) }),
    ])
  } catch (e) {
    await auth.api.removeUser({ headers, body: { userId } }).catch((err: unknown) => console.error('orphan user cleanup failed', userId, err))
    throw e
  }

  const mailed = await sendInvite(auth, input.email, appUrl)
  return { workerId, email: input.email, mailed }
}

export async function resendInvite(
  deps: { db: Db; auth: Auth; appUrl: string },
  ctx: SessionContext,
  input: z.infer<typeof ResendInviteInput>,
): Promise<{ mailed: boolean }> {
  requireAdmin(ctx)
  const row = await deps.db
    .select({ email: schema.user.email })
    .from(schema.humanWorkers)
    .innerJoin(schema.user, eq(schema.user.id, schema.humanWorkers.userId))
    .innerJoin(schema.workers, eq(schema.workers.id, schema.humanWorkers.workerId))
    .where(and(eq(schema.humanWorkers.workerId, input.workerId), isNull(schema.workers.archivedAt)))
    .get()
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'workerId')
  return { mailed: await sendInvite(deps.auth, row.email, deps.appUrl) }
}
