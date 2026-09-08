import { createStart, createCsrfMiddleware } from '@tanstack/react-start'
import { sessionMiddleware } from '~/server/middleware/session'

// Defining start.ts drops Start's auto-CSRF; re-add it (#3).
export const startInstance = createStart(() => ({
  requestMiddleware: [createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' }), sessionMiddleware],
}))
