import { createMiddleware } from '@tanstack/react-start'
import { getDb } from '~/server/db'
import { HttpError } from '~/lib/errors'
import { buildSessionContext } from '~/server/sessionContext'
import type { RawSession, SessionContext } from '~/server/context'

export const authMw = createMiddleware({ type: 'function' }).server(async ({ context, next }) => {
  const raw = (context as unknown as { rawSession?: RawSession }).rawSession
  if (!raw) throw new HttpError(401, 'UNAUTHENTICATED')
  const sessionCtx = await buildSessionContext(getDb(), raw)
  return next({ context: { sessionCtx } })
})

/** Reads the context `authMw` attached; use in every fn handler instead of casting inline. */
export const ctxOf = (context: unknown): SessionContext => (context as { sessionCtx: SessionContext }).sessionCtx
