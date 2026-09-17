import type { schema } from './db'

export type Role = 'operator' | 'billing' | 'admin'
export type UserRow = typeof schema.user.$inferSelect
export type SessionRow = typeof schema.session.$inferSelect
export type RawSession = { user: UserRow; session: SessionRow } | null

export type SessionContext = {
  userId: string
  email: string
  name: string
  workerId: string
  roles: Role[]
  superviseeWorkerIds: string[]
}

export const isAdmin = (c: SessionContext) => c.roles.includes('admin')
export const hasRole = (c: SessionContext, ...need: Role[]) => isAdmin(c) || need.some((r) => c.roles.includes(r))
// Money is visible to billing and admin only (#5).
export const canSeeMoney = (c: SessionContext) => hasRole(c, 'billing')

/* A malformed `human_workers.roles` row would 500 the session path or the worker
   list. Fall back to a minimum-viable 'operator' set and log it so the row can
   be repaired; the call site still gates on the roles it needs. (#L5) */
export function parseRolesOrDefault(raw: string): Role[] {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter((r): r is Role => r === 'operator' || r === 'billing' || r === 'admin')
    }
  } catch (e) {
    console.error('parseRolesOrDefault: malformed roles row', { raw, err: (e as Error).message })
  }
  return ['operator']
}
