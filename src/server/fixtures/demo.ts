import { eq } from 'drizzle-orm'
// Schema imported directly, not via ~/server/db: the seed runs under Node, where `cloudflare:workers` cannot load.
import * as schema from '../../../drizzle/schema'
import type { Db } from '~/server/db'
import type { Role } from '~/lib/schemas/workers'

export const ids = {
  opWorker: 'demo-0000-operator-worker',
  billingWorker: 'demo-0000-billing-worker',
  adminWorker: 'demo-0000-admin-worker',
  agent1: 'demo-0000-agent-1',
  agent2: 'demo-0000-agent-2',
  c1: 'demo-0000-client-1',
  c2: 'demo-0000-client-2',
  p1: 'demo-0000-project-1',
  p2: 'demo-0000-project-2',
  j1: 'demo-0000-job-1',
  j2: 'demo-0000-job-2',
  j3: 'demo-0000-job-3',
  j4: 'demo-0000-job-4',
} as const

export type DemoHuman = { workerId: string; email: string; name: string; roles: readonly Role[] }
export const demoHumans: readonly DemoHuman[] = [
  { workerId: ids.adminWorker, email: 'admin@example.com', name: 'Demo Admin', roles: ['operator', 'billing', 'admin'] },
  { workerId: ids.billingWorker, email: 'billing@example.com', name: 'Demo Billing', roles: ['operator', 'billing'] },
  { workerId: ids.opWorker, email: 'ops@example.com', name: 'Demo Operator', roles: ['operator'] },
]

/** Monday 2026-08-31 00:00 UTC. Tests anchor here; the seed passes the current week. */
export const DEMO_ANCHOR_MS = Date.UTC(2026, 7, 31)

export async function insertDemo(db: Db, opts: { anchorMs?: number } = {}) {
  const now = new Date()
  const anchor = opts.anchorMs ?? DEMO_ANCHOR_MS
  const at = (dayOffset: number, h: number, m = 0) => new Date(anchor + dayOffset * 86_400_000 + (h * 60 + m) * 60_000)

  const lt = (id: string, key: string, name: string, paid: boolean, accrualMethod: string, minutesPerYear: number, maxCarryOverMinutes: number, yearBasis = 'calendar') => ({
    id,
    key,
    name,
    paid,
    accrualMethod,
    minutesPerYear,
    accrualRatePer10k: 0,
    maxCarryOverMinutes,
    yearBasis,
    createdAt: at(0, 0),
    updatedAt: at(0, 0),
  })
  const leaveTypeRows = [
    lt('lt-annual', 'annual', 'Annual leave', true, 'monthly_prorata', 20 * 480, 5 * 480),
    lt('lt-sick', 'sick', 'Sick leave (paid)', true, 'annual_allotment', 10 * 480, 0, 'anniversary'),
    lt('lt-unpaid', 'unpaid', 'Unpaid leave', false, 'annual_allotment', 0, 0),
  ]

  await db.batch([
    db
      .insert(schema.workers)
      .values([
        { id: ids.opWorker, kind: 'human', createdAt: now },
        { id: ids.billingWorker, kind: 'human', createdAt: now },
        { id: ids.adminWorker, kind: 'human', createdAt: now },
        { id: ids.agent1, kind: 'agent', name: 'Atlas', supervisorId: ids.opWorker, createdAt: now },
        { id: ids.agent2, kind: 'agent', name: 'Beacon', supervisorId: ids.opWorker, createdAt: now },
      ])
      .onConflictDoNothing(),
    db
      .insert(schema.agentWorkers)
      .values([
        { workerId: ids.agent1, model: 'claude-opus-5', framework: 'langgraph' },
        { workerId: ids.agent2, model: 'claude-sonnet-5', framework: 'crewai' },
      ])
      .onConflictDoNothing(),
    db
      .insert(schema.clients)
      .values([
        { id: ids.c1, name: 'Acme Aerospace', createdAt: now },
        { id: ids.c2, name: 'Nimbus Freight', createdAt: now },
      ])
      .onConflictDoNothing(),
    db
      .insert(schema.projects)
      .values([
        { id: ids.p1, clientId: ids.c1, name: 'Flight Ops Automation', createdAt: now },
        { id: ids.p2, clientId: ids.c2, name: 'Route Optimization', createdAt: now },
      ])
      .onConflictDoNothing(),
    db
      .insert(schema.jobs)
      .values([
        { id: ids.j1, projectId: ids.p1, name: 'Pipeline Maintenance', billableRateCents: 14000, createdAt: now },
        { id: ids.j2, projectId: ids.p1, name: 'Eval Harness Runs', billableRateCents: 9000, createdAt: now },
        { id: ids.j3, projectId: ids.p2, name: 'Route Model Tuning', billableRateCents: 12000, createdAt: now },
        { id: ids.j4, projectId: ids.p2, name: 'Internal Data Cleansing', billableRateCents: null, createdAt: now },
      ])
      .onConflictDoNothing(),
    db.insert(schema.orgSettings).values({ id: 'org', defaultBillableRateCents: 10_000, defaultDayMinutes: 480, defaultWeeklyTargetHours: 40, updatedAt: now }).onConflictDoNothing(),
    db.insert(schema.leaveTypes).values(leaveTypeRows).onConflictDoNothing(),
  ])

  const iv = (id: string, workerId: string, jobId: string, rateCents: number | null, d: number, h1: number, h2: number) => ({
    id: `demo-0000-iv-${id}`,
    workerId,
    jobId,
    rateCents,
    startedAt: at(d, h1),
    endedAt: at(d, h2),
    createdBy: ids.opWorker,
    createdAt: now,
    updatedAt: now,
  })
  await db
    .insert(schema.intervals)
    .values([
      iv('01', ids.opWorker, ids.j1, 14000, 0, 9, 12),
      iv('02', ids.opWorker, ids.j2, 9000, 0, 10, 11), // overlaps 01 → 60 min premium
      iv('03', ids.agent1, ids.j1, 14000, 0, 9, 17),
      iv('04', ids.agent2, ids.j3, 12000, 0, 13, 16),
      iv('05', ids.opWorker, ids.j2, 9000, 1, 9, 13),
      iv('06', ids.opWorker, ids.j3, 12000, 1, 11, 12),
      iv('07', ids.opWorker, ids.j1, 14000, 2, 14, 18), // 22:00–02:00 Perth; clips to 120 min on Wed in Perth
      iv('08', ids.opWorker, ids.j4, null, 3, 9, 11), // non-billable
    ])
    .onConflictDoNothing()

  await db.batch([
    db
      .insert(schema.leaveRequests)
      .values({
        id: 'lr-demo-1',
        workerId: ids.opWorker,
        typeId: 'lt-annual',
        startDay: '2026-09-24',
        endDay: '2026-09-25',
        minutesPerDay: 480,
        status: 'approved',
        reason: 'Family trip',
        submittedAt: at(-14, 0),
        submittedBy: ids.opWorker,
        decidedAt: at(-13, 0),
        decidedBy: ids.billingWorker,
        decisionReason: 'Enjoy',
      })
      .onConflictDoNothing(),
    db.insert(schema.leaveEvents).values({
      id: 'le-demo-1',
      requestId: 'lr-demo-1',
      kind: 'approve',
      actorWorkerId: ids.billingWorker,
      at: at(-13, 0),
    }).onConflictDoNothing(),
  ])
}

export type PasswordHasher = { $context: Promise<{ password: { hash(p: string): Promise<string> } }> }

/* Writes user + credential account + human_workers directly: the admin plugin's
   createUser needs an admin session, which does not exist yet at bootstrap (#16). */
export async function seedAuthUsers(
  db: Db,
  auth: PasswordHasher,
  users: { workerId: string; email: string; name: string; password: string; roles: readonly string[] }[],
) {
  const ctx = await auth.$context
  const now = new Date()
  for (const u of users) {
    const existing = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, u.email)).get()
    const userId = existing?.id ?? crypto.randomUUID()
    if (!existing) {
      const hash = await ctx.password.hash(u.password)
      await db.batch([
        db.insert(schema.user).values({
          id: userId,
          email: u.email,
          name: u.name,
          emailVerified: true,
          role: u.roles.includes('admin') ? 'admin' : 'user',
          createdAt: now,
          updatedAt: now,
        }),
        db.insert(schema.account).values({
          id: crypto.randomUUID(),
          userId,
          accountId: userId,
          providerId: 'credential',
          password: hash,
          createdAt: now,
          updatedAt: now,
        }),
      ])
    }
    await db
      .insert(schema.humanWorkers)
      .values({ workerId: u.workerId, userId, roles: JSON.stringify(u.roles) })
      .onConflictDoNothing()
  }
}
