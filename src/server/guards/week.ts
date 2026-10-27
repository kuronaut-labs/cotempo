import { and, eq, inArray, sql, type SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { schema, type Db } from '~/server/db'
import { HttpError } from '~/lib/errors'

/** Approved approval rows among `weekKeys`; writes use it as a NOT EXISTS condition too. */
export function lockedWeeksQuery(db: Db, workerId: string, weekKeys: string[]) {
  return db
    .select({ weekStart: schema.approvals.weekStart })
    .from(schema.approvals)
    .where(
      and(
        eq(schema.approvals.workerId, workerId),
        inArray(schema.approvals.weekStart, weekKeys),
        eq(schema.approvals.status, 'approved'),
      ),
    )
}

// Only 'approved' locks (#26). Callers pass every week key the mutation touches.
export async function assertWeeksEditable(db: Db, workerId: string, weekKeys: string[]): Promise<void> {
  if (weekKeys.length === 0) return
  const locked = await lockedWeeksQuery(db, workerId, weekKeys).get()
  if (locked) throw new HttpError(409, 'WEEK_LOCKED', undefined, { weekStart: locked.weekStart })
}

/* A mutation on a 'submitted' week drops it back to 'draft' and records why,
   so the approver sees it leave the queue (#26). */
export async function resetSubmittedWeeks(db: Db, workerId: string, weekKeys: string[], actorWorkerId: string): Promise<void> {
  const stmts = submittedWeekResets(db, workerId, weekKeys, actorWorkerId, new Date())
  if (stmts.length > 0) await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
}

/** The writes resetSubmittedWeeks makes, for callers that batch them with their own mutation.
    Set-based, with no read beforehand, so a week submitted after the caller's checks is still caught;
    `when` limits them to batches where the caller's own write took effect. */
export function submittedWeekResets(
  db: Db,
  workerId: string,
  weekKeys: string[],
  actorWorkerId: string,
  now: Date,
  when?: SQL,
): BatchItem<'sqlite'>[] {
  if (weekKeys.length === 0) return []
  const submitted = and(
    eq(schema.approvals.workerId, workerId),
    inArray(schema.approvals.weekStart, weekKeys),
    eq(schema.approvals.status, 'submitted'),
    when,
  )
  return [
    // Events first: the update below takes the rows out of 'submitted'. Ids are 32 random hex digits, minted in SQL.
    // Columns in approval_events definition order: id, approval_id, kind, actor_worker_id, reason, at.
    db.insert(schema.approvalEvents).select(sql`select lower(hex(randomblob(16))), ${schema.approvals.id}, 'edited_after_submit',
      ${actorWorkerId}, null, ${now.getTime()} from ${schema.approvals} where ${submitted}`),
    db.update(schema.approvals).set({ status: 'draft', updatedAt: now }).where(submitted),
  ]
}
