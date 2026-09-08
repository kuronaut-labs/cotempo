import { createMiddleware } from '@tanstack/react-start'
import { HttpError } from '~/lib/errors'
import { hasRole, type Role, type SessionContext } from '~/server/context'

export const requireRole = (...need: Role[]) =>
  createMiddleware({ type: 'function' }).server(async ({ context, next }) => {
    const c = (context as unknown as { sessionCtx?: SessionContext }).sessionCtx
    if (!c) throw new HttpError(401, 'UNAUTHENTICATED')
    if (!hasRole(c, ...need)) throw new HttpError(403, 'FORBIDDEN')
    return next()
  })
