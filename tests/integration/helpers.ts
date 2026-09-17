import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../../drizzle/schema'
import { insertDemo, demoHumans, ids, DEMO_ANCHOR_MS } from '../../src/server/fixtures/demo'
import type { SessionContext } from '../../src/server/context'

export const TZ = 'Australia/Perth'
export const db = drizzle(env.DB, { schema })
export const anchorMs = DEMO_ANCHOR_MS

/** Deps object every service function takes. `now` is fixed so timestamps are assertable. */
export const deps = (now = new Date(anchorMs + 5 * 86_400_000)) => ({ db, tz: TZ, now: () => now })

export const userIdOf = (workerId: string) => `user-${workerId}`

export async function resetDb() {
  await db.batch([
    db.delete(schema.approvalEvents),
    db.delete(schema.leaveEvents),
    db.delete(schema.leaveRequests),
    db.delete(schema.leaveTypes),
    db.delete(schema.approvals),
    db.delete(schema.intervals),
    db.delete(schema.jobs),
    db.delete(schema.projects),
    db.delete(schema.clients),
    db.delete(schema.agentWorkers),
    db.delete(schema.humanWorkers),
    db.delete(schema.workers),
    db.delete(schema.session),
    db.delete(schema.account),
    db.delete(schema.verification),
    db.delete(schema.user),
  ])
  await insertDemo(db)
  const now = new Date()
  // human_workers rows without credential accounts are enough for guard and service tests.
  await db
    .insert(schema.user)
    .values(
      demoHumans.map((h) => ({
        id: userIdOf(h.workerId),
        email: h.email,
        name: h.name,
        emailVerified: true,
        role: h.roles.includes('admin') ? 'admin' : 'user',
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing()
  await db
    .insert(schema.humanWorkers)
    .values(demoHumans.map((h) => ({ workerId: h.workerId, userId: userIdOf(h.workerId), roles: JSON.stringify(h.roles) })))
    .onConflictDoNothing()
}

export function asUser(role: 'operator' | 'billing' | 'admin'): SessionContext {
  const h = demoHumans.find((x) => x.roles.at(-1) === role)!
  return {
    userId: userIdOf(h.workerId),
    email: h.email,
    name: h.name,
    workerId: h.workerId,
    roles: [...h.roles],
    superviseeWorkerIds: h.workerId === ids.opWorker ? [ids.agent1, ids.agent2] : [],
  }
}

/** Instant at `h:m` on day `dayOffset` of the demo week, in UTC (the fixtures are UTC-anchored). */
export const at = (dayOffset: number, h: number, m = 0) => new Date(anchorMs + dayOffset * 86_400_000 + (h * 60 + m) * 60_000)
export const iso = (d: Date) => d.toISOString()

export async function setWeekStatus(workerId: string, weekStart: string, status: 'draft' | 'submitted' | 'approved' | 'rejected') {
  const now = new Date()
  await db
    .insert(schema.approvals)
    .values({ id: `appr-${workerId}-${weekStart}`, workerId, weekStart, status, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [schema.approvals.workerId, schema.approvals.weekStart], set: { status, updatedAt: now } })
}
