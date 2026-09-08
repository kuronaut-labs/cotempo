import { eq } from 'drizzle-orm'
import type { z } from 'zod'
import { InviteInput, ResendInviteInput } from '~/lib/schemas/workers'
import { HttpError } from '~/lib/errors'
import type { Auth } from '~/server/auth'
import { schema, type Db } from '~/server/db'
import type { SessionContext } from '~/server/context'

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

/* Admin session is forwarded because the admin plugin refuses createUser without
   one. The random password is never sent anywhere; the reset token is the invite. */
export async function inviteUser(
  deps: InviteDeps,
  _ctx: SessionContext,
  input: z.infer<typeof InviteInput>,
): Promise<InviteResult> {
  const { db, auth, headers, appUrl } = deps
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
  await db.batch([
    db.insert(schema.workers).values({
      id: workerId,
      kind: 'human',
      supervisorId: input.supervisorId ?? null,
      createdAt: now,
    }),
    db.insert(schema.humanWorkers).values({ workerId, userId, roles: JSON.stringify(input.roles) }),
  ])

  const mailed = await sendInvite(auth, input.email, appUrl)
  return { workerId, email: input.email, mailed }
}

export async function resendInvite(
  deps: { db: Db; auth: Auth; appUrl: string },
  _ctx: SessionContext,
  input: z.infer<typeof ResendInviteInput>,
): Promise<{ mailed: boolean }> {
  const row = await deps.db
    .select({ email: schema.user.email })
    .from(schema.humanWorkers)
    .innerJoin(schema.user, eq(schema.user.id, schema.humanWorkers.userId))
    .where(eq(schema.humanWorkers.workerId, input.workerId))
    .get()
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'workerId')
  return { mailed: await sendInvite(deps.auth, row.email, deps.appUrl) }
}
