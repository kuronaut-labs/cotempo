import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { InviteInput, ResendInviteInput } from '~/lib/schemas/workers'
import { getAuth } from '~/server/auth'
import { getDb } from '~/server/db'
import { getEnv } from '~/server/env'
import { authMw, ctxOf } from '~/server/middleware/authMw'
import { requireRole } from '~/server/middleware/roleGuard'
import { inviteUser, resendInvite } from '~/server/services/invites'

const adminOnly = [authMw, requireRole('admin')]

export const inviteUserFn = createServerFn({ method: 'POST' })
  .middleware(adminOnly)
  .validator(InviteInput)
  .handler(({ data, context }) =>
    inviteUser(
      { db: getDb(), auth: getAuth(), headers: getRequest().headers, appUrl: getEnv().APP_URL },
      ctxOf(context),
      data,
    ))

export const resendInviteFn = createServerFn({ method: 'POST' })
  .middleware(adminOnly)
  .validator(ResendInviteInput)
  .handler(({ data, context }) =>
    resendInvite({ db: getDb(), auth: getAuth(), appUrl: getEnv().APP_URL }, ctxOf(context), data))
