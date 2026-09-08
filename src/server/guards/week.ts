import { and, eq, inArray } from 'drizzle-orm'
import { schema, type Db } from '~/server/db'
import { HttpError } from '~/lib/errors'

// Only 'approved' locks (#26). Callers pass every week key the mutation touches.
export async function assertWeeksEditable(db: Db, workerId: string, weekKeys: string[]): Promise<void> {
  if (weekKeys.length === 0) return
  const locked = await db
    .select({ weekStart: schema.approvals.weekStart })
    .from(schema.approvals)
    .where(
      and(
        eq(schema.approvals.workerId, workerId),
        inArray(schema.approvals.weekStart, weekKeys),
        eq(schema.approvals.status, 'approved'),
      ),
    )
    .get()
  if (locked) throw new HttpError(409, 'WEEK_LOCKED', undefined, { weekStart: locked.weekStart })
}

/* A mutation on a 'submitted' week drops it back to 'draft' and records why,
   so the approver sees it leave the queue (#26). */
export async function resetSubmittedWeeks(db: Db, workerId: string, weekKeys: string[], actorWorkerId: string): Promise<void> {
  if (weekKeys.length === 0) return
  const now = new Date()
  const rows = await db
    .select({ id: schema.approvals.id })
    .from(schema.approvals)
    .where(
      and(
        eq(schema.approvals.workerId, workerId),
        inArray(schema.approvals.weekStart, weekKeys),
        eq(schema.approvals.status, 'submitted'),
      ),
    )
    .all()
  if (rows.length === 0) return
  const idList = rows.map((r) => r.id)
  await db.batch([
    db.update(schema.approvals).set({ status: 'draft', updatedAt: now }).where(inArray(schema.approvals.id, idList)),
    db.insert(schema.approvalEvents).values(
      idList.map((approvalId) => ({
        id: crypto.randomUUID(),
        approvalId,
        kind: 'edited_after_submit' as const,
        actorWorkerId,
        at: now,
      })),
    ),
  ])
}
