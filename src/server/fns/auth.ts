import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getAuth } from '~/server/auth'
import { getDb } from '~/server/db'
import { buildSessionContext } from '~/server/middleware/authMw'
import type { RawSession } from '~/server/context'

// Used by route beforeLoad (not the client SDK) so SSR sees cookies.
export const getSessionFn = createServerFn({ method: 'GET' }).handler(async () => {
  const s = await getAuth().api.getSession({ headers: getRequest().headers })
  return s ? { name: s.user.name, email: s.user.email } : null
})

// Full SessionContext for role-gated UI (nav, admin redirect). UX only; every fn re-checks (#8/#10).
export const getSessionCtxFn = createServerFn({ method: 'GET' }).handler(async () => {
  const raw = (await getAuth().api.getSession({ headers: getRequest().headers })) as RawSession
  if (!raw) return null
  return buildSessionContext(getDb(), raw)
})
