import { createMiddleware } from '@tanstack/react-start'
import { getAuth } from '~/server/auth'
import type { RawSession } from '~/server/context'

// Request middleware: loads the BetterAuth session once per request for every handler.
export const sessionMiddleware = createMiddleware({ type: 'request' }).server(async ({ request, next }) => {
  const rawSession = (await getAuth().api.getSession({ headers: request.headers })) as RawSession
  return next({ context: { rawSession } })
})
