import { HttpError } from '~/lib/errors'
import { isAdmin, type SessionContext } from '~/server/context'

const inScope = (c: SessionContext, id: string) => id === c.workerId || c.superviseeWorkerIds.includes(id)

// Entry/edit: self + supervisees; admin anyone; billing gets nothing extra (#17).
export function assertCanEditWorker(c: SessionContext, target: string): void {
  if (isAdmin(c) || inScope(c, target)) return
  throw new HttpError(403, 'FORBIDDEN_TARGET', 'workerId')
}

// View: billing/admin all; operators self + supervisees.
export function assertCanViewWorker(c: SessionContext, target: string): void {
  if (c.roles.includes('billing') || isAdmin(c) || inScope(c, target)) return
  throw new HttpError(403, 'FORBIDDEN_TARGET', 'workerId')
}
