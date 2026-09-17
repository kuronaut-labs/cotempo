# Positions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Named positions with a custom billable rate that admins assign to human workers; once assigned, the position's rate overrides the job's billable rate on that worker's **new** time entries.

**Architecture:** A `positions` table plus a `positionId` column on `humanWorkers` (one position per worker). The override happens at the two existing `rateCents` snapshot sites in `src/server/services/intervals.ts` — the position rate is resolved at write time and snapshotted per interval, exactly like the job rate today (#18). Position CRUD and assignment are a service + fns pair mirroring `workers.ts`; the UI adds an admin Positions page and position pickers on the roster and invite form.

**Tech Stack:** Drizzle (D1), Zod v4, TanStack Start server fns + react-form, reicon-react icons, existing design system (`docs/DESIGN.md`).

## Global Constraints

- Node 24 via mise (there is no `nvm` on this machine). npm 11.
- Gate for every task: `npm run check` exits 0 (contract-manifest + lint + tsc + unit + integration). Contract tests (`tests/contract/**`) and `MANIFEST.sha256` are untouchable — never add, edit, or list files there.
- Migrations are generated (`npm run db:generate`), never hand-edited. This plan lands **after** the leave plan, so it generates migration `0003_*` (leave generated `0002_*`). If executed before leave for any reason, the number will differ — that is fine, the tool picks it.
- Money (#5/#18): `rateCents` is money. Views carrying it are only served to `canSeeMoney` (billing/admin). Never emit `rateCents: null` or `0` to operators — omit the key. Rate changes never touch existing intervals' `rate_cents` (#18).
- Service shape (#10/#20): business logic in `src/server/services/positions.ts` as `(deps, ctx, input)` functions; `src/server/fns/positions.ts` are thin wrappers. Tests call services directly with `deps()` and `asUser(role)` from `tests/integration/helpers.ts`.
- Role checks twice: admin fns use `[authMw, requireRole('admin')]` middleware (the `workers.ts` fns precedent); services re-check with `isAdmin(ctx)` throwing `HttpError(403, 'FORBIDDEN')`.
- Errors (#25): `HttpError(status, CODE, field?, data?)`, upper snake codes. New codes this plan adds:
  - `POSITION_NOT_FOUND` 404 — `field: 'id'` when updating/archiving an unknown or archived position; `field: 'positionId'` when assigning an unknown position.
  - `POSITION_IN_USE` 409 — `field: 'id'`, `data: { count }` — archive blocked while live humans hold the position.
  - `WORKER_NOT_HUMAN` 400 — `field: 'workerId'` — assigning a position to an agent.
  - Reused as-is: `FORBIDDEN` 403, `NOT_FOUND` 404 (`workerId`), `JOB_NOT_FOUND` 404 (`jobId`).
- Never hard-delete. Positions archive via `archivedAt`. Every read filters `archivedAt IS NULL`.
- No new dependencies. No changes to config files, `tests/contract/**`, `.wayfinder/**`, other `docs/**`.
- Copy freeze: existing user-visible strings stay byte-identical. New screens get new copy (listed per task, frozen once landed).
- `src/routeTree.gen.ts` churns when routes are added — regenerate with `npm run build` and commit the churn with the route change.
- Design system per `docs/DESIGN.md` (Notion hybrid): cards `radius-lg` + `shadow-1/2`, `.entryform`/`.field`/`.admin-form` patterns, icons reicon-react Outline `currentColor` 13–15px.
- Rate precedence (documented, then implemented in B1): a job's rate comes from the explicit input, else the org default (`defaults` plan B1); the **position override applies at interval write time when the job is billable** — `job.billableRateCents === null` (non-billable) stays `null`; `0` ($0) is billable, so a position overrides it.

---

## Design analysis and locked decisions

1. **Position rate is a billable-rate override, not payroll.** It snapshots into `intervals.rateCents` on new writes; every existing billing view, report, and invoice works unchanged because they already read `rate_cents`.
2. **One position per worker**, stored as `humanWorkers.positionId` (nullable FK). Agents never get positions.
3. **Archived positions stop overriding.** The override lookup filters `positions.archivedAt IS NULL`; a worker holding an archived position simply falls back to the job rate. Assignment of an archived position is rejected (`POSITION_NOT_FOUND`).
4. **Assignment is admin-only** (roster select + invite form), mirroring `setSupervisor`.
5. **`listPositions` is money-gated** (billing/admin): the view carries `rateCents`. Operators never receive it; the roster select for admins renders names only anyway (admins can see money).
6. **Seed**: two positions — `Senior developer` at 12_000 cents ($120/h), `Designer` at 9_000 ($90/h) — and the seeded `ops` human worker assigned to `Senior developer` so the override is demonstrable out of the box.

## File structure

| Concern | File |
|---|---|
| Positions table + `humanWorkers.positionId` | `drizzle/schema.ts` (+ generated migration) |
| Seed fixtures | `src/server/fixtures/demo.ts` |
| Zod inputs + view type | `src/lib/schemas/positions.ts` (new) |
| Service (CRUD, assign, money gate) | `src/server/services/positions.ts` (new) |
| Server fns | `src/server/fns/positions.ts` (new) |
| Rate override at write time | `src/server/services/intervals.ts` (modify) |
| Positions admin page | `src/routes/_app/admin/positions.tsx` (new) + `admin/route.tsx` subnav |
| Assignment UI | `src/routes/_app/admin/workers.tsx`, `src/components/workerRoster.tsx`, `src/components/inviteForm.tsx` (modify) |
| Workers view + invite input carry position | `src/server/services/workers.ts`, `src/lib/schemas/workers.ts`, `src/server/services/invites.ts` (modify) |
| Tests | `tests/integration/positions.test.ts` (new), `tests/integration/intervals.test.ts` + `tests/integration/invites.test.ts` (extend) |

---

### Task A1: Positions schema, migration, seed

**Files:**
- Modify: `drizzle/schema.ts`
- Modify: `src/server/fixtures/demo.ts`
- Generated: `drizzle/migrations/0003_*.sql` + `meta/*` (via `npm run db:generate`)

**Interfaces:**
- Produces: `positions` table exported from `drizzle/schema.ts` as `positions` (`{ id, name, rateCents, createdAt, archivedAt }`); `humanWorkers.positionId` column. Later tasks import `positions` from the schema block.

- [ ] **Step 1: Add the schema**

In `drizzle/schema.ts`, add the `positions` table **before** `humanWorkers` (the FK needs it declared first), then extend `humanWorkers`:

```ts
export const positions = sqliteTable('positions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  // cents/hour — money (#5); only ever served through canSeeMoney paths
  rateCents: integer('rate_cents').notNull(),
  createdAt: ts('created_at'),
  archivedAt: ts('archived_at'),
});

export const humanWorkers = sqliteTable('human_workers', {
  workerId: text('worker_id')
    .primaryKey()
    .references(() => workers.id),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id),
  roles: text('roles').notNull().default('["operator"]'),
  positionId: text('position_id').references(() => positions.id),
});
```

`ts` is the file's existing `integer(..., { mode: 'timestamp_ms' })` helper — use it, do not redeclare.

- [ ] **Step 2: Generate the migration**

Run: `nvm use 2>/dev/null; npm run db:generate`
Expected: a new `drizzle/migrations/0003_*.sql` creating `positions` and adding `position_id` to `human_workers` (plus `meta/0003_snapshot.json`, `_journal.json` updates). Never hand-edit these.

- [ ] **Step 3: Apply + verify locally**

Run: `npm run db:migrate:local`
Expected: `0003` applied.

Run: `npm run db:seed`
Expected: exit 0, `seeded`.

- [ ] **Step 4: Extend the demo fixtures**

In `src/server/fixtures/demo.ts`, following the file's existing `db.batch` + `onConflictDoNothing()` pattern and its `ids` fixture object: add position ids (`ids.posSenior`, `ids.posDesigner`), the two position rows, and assign the seeded ops human worker (`ids.opWorker`) to the senior position inside the same batch:

```ts
// positions — rate override demo (#positions-plan)
{ posSenior: 'pos-senior-dev', posDesigner: 'pos-designer' },
```

```ts
db.insert(positions).values([
  { id: ids.posSenior, name: 'Senior developer', rateCents: 12_000, createdAt: now },
  { id: ids.posDesigner, name: 'Designer', rateCents: 9_000, createdAt: now },
]).onConflictDoNothing(),
db.update(humanWorkers)
  .set({ positionId: ids.posSenior })
  .where(eq(humanWorkers.workerId, ids.opWorker)),
```

Use the file's actual `now`/`ids`/import conventions — mirror neighbouring rows exactly.

- [ ] **Step 5: Re-seed and verify**

Run: `npm run db:seed` then verify with a quick query (wrangler d1 or a scratch node script) that `positions` has the two rows and `human_workers.position_id` for the ops worker equals `pos-senior-dev`.

- [ ] **Step 6: Gate + commit**

Run: `npm run check` → exit 0 (existing 213 tests; contract manifest untouched).

```bash
git add drizzle/schema.ts drizzle/migrations src/server/fixtures/demo.ts
git commit -m "feat: positions schema and seed"
```

### Task A2: Positions schemas + service (TDD)

**Files:**
- Create: `src/lib/schemas/positions.ts`
- Create: `src/server/services/positions.ts`
- Test: `tests/integration/positions.test.ts` (new)

**Interfaces:**
- Consumes: `Deps` from `~/server/services/deps`; `isAdmin`, `canSeeMoney` from `~/server/context`; `HttpError` from `~/lib/errors`; `positions`, `humanWorkers`, `workers` from the drizzle schema (via `import { schema } from '~/server/db'` — the repo convention); `deps()`, `asUser()` from `tests/integration/helpers.ts`.
- Produces: `PositionView = { id: string; name: string; rateCents: number; createdAt: Date }`; service functions `listPositions(deps, ctx) => Promise<PositionView[]>`, `createPosition(deps, ctx, input: PositionInput) => Promise<PositionView>`, `updatePosition(deps, ctx, input: UpdatePositionInput) => Promise<PositionView>`, `archivePosition(deps, ctx, input: ArchivePositionInput) => Promise<void>`, `setWorkerPosition(deps, ctx, input: SetWorkerPositionInput) => Promise<void>`.

- [ ] **Step 1: Write the failing tests**

`tests/integration/positions.test.ts` — mirror `tests/integration/settings.service.test.ts` structure (`beforeEach` → `resetDb(db)` + `insertDemo(db)`; `deps()`; `asUser('admin' | 'billing' | 'operator')`):

```ts
import { describe, expect, it } from 'vitest'
import { and, eq, isNull } from 'drizzle-orm'
import { deps, asUser, db, resetDb } from './helpers'
import { insertDemo, ids } from '../../src/server/fixtures/demo'
import { schema } from '~/server/db'
import * as svc from '~/server/services/positions'
import { HttpError } from '~/lib/errors'

beforeEach(async () => {
  await resetDb(db)
  await insertDemo(db)
})

describe('positions service', () => {
  it('billing sees seeded positions with rates', async () => {
    const rows = await svc.listPositions(deps(), asUser('billing'))
    const senior = rows.find((r) => r.id === ids.posSenior)
    expect(senior?.name).toBe('Senior developer')
    expect(senior?.rateCents).toBe(12_000)
  })

  it('operator cannot list positions', async () => {
    await expect(svc.listPositions(deps(), asUser('operator'))).rejects.toMatchObject({
      status: 403, code: 'FORBIDDEN',
    })
  })

  it('admin creates a position', async () => {
    const v = await svc.createPosition(deps(), asUser('admin'), { name: 'Support engineer', rateCents: 8_000 })
    expect(v.name).toBe('Support engineer')
    expect(v.rateCents).toBe(8_000)
  })

  it('billing cannot create', async () => {
    await expect(
      svc.createPosition(deps(), asUser('billing'), { name: 'X', rateCents: 1 }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })

  it('update patches only defined keys', async () => {
    const v = await svc.updatePosition(deps(), asUser('admin'), { id: ids.posDesigner, rateCents: 9_500 })
    expect(v.rateCents).toBe(9_500)
    expect(v.name).toBe('Designer')
  })

  it('update unknown position → POSITION_NOT_FOUND', async () => {
    await expect(
      svc.updatePosition(deps(), asUser('admin'), { id: 'pos-nope', name: 'X' }),
    ).rejects.toMatchObject({ status: 404, code: 'POSITION_NOT_FOUND', field: 'id' })
  })

  it('archive blocked while a live worker holds it', async () => {
    // ops worker is seeded onto posSenior (A1)
    await expect(
      svc.archivePosition(deps(), asUser('admin'), { id: ids.posSenior }),
    ).rejects.toMatchObject({ status: 409, code: 'POSITION_IN_USE', field: 'id' })
  })

  it('archive clears once unassigned', async () => {
    await svc.setWorkerPosition(deps(), asUser('admin'), { workerId: ids.opWorker, positionId: null })
    await svc.archivePosition(deps(), asUser('admin'), { id: ids.posSenior })
    const live = await db.select().from(schema.positions)
      .where(and(eq(schema.positions.id, ids.posSenior), isNull(schema.positions.archivedAt)))
    expect(live).toHaveLength(0)
  })

  it('setWorkerPosition assigns and clears', async () => {
    await svc.setWorkerPosition(deps(), asUser('admin'), { workerId: ids.opWorker, positionId: ids.posDesigner })
    let row = await db.select().from(schema.humanWorkers).where(eq(schema.humanWorkers.workerId, ids.opWorker))
    expect(row[0]?.positionId).toBe(ids.posDesigner)

    await svc.setWorkerPosition(deps(), asUser('admin'), { workerId: ids.opWorker, positionId: null })
    row = await db.select().from(schema.humanWorkers).where(eq(schema.humanWorkers.workerId, ids.opWorker))
    expect(row[0]?.positionId).toBeNull()
  })

  it('setWorkerPosition rejects agents', async () => {
    await expect(
      svc.setWorkerPosition(deps(), asUser('admin'), { workerId: ids.agentWorker, positionId: ids.posDesigner }),
    ).rejects.toMatchObject({ status: 400, code: 'WORKER_NOT_HUMAN', field: 'workerId' })
  })

  it('setWorkerPosition rejects unknown position and unknown worker', async () => {
    await expect(
      svc.setWorkerPosition(deps(), asUser('admin'), { workerId: ids.opWorker, positionId: 'pos-nope' }),
    ).rejects.toMatchObject({ status: 404, code: 'POSITION_NOT_FOUND', field: 'positionId' })
    await expect(
      svc.setWorkerPosition(deps(), asUser('admin'), { workerId: 'w-nope', positionId: ids.posDesigner }),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND', field: 'workerId' })
  })

  it('operator cannot assign', async () => {
    await expect(
      svc.setWorkerPosition(deps(), asUser('operator'), { workerId: ids.opWorker, positionId: null }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })
})
```

If `ids.agentWorker` (or similar) is named differently in `demo.ts`, use the file's actual agent id constant — check the `ids` object first.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/integration/positions.test.ts`
Expected: FAIL — module `~/server/services/positions` not found.

- [ ] **Step 3: Schemas**

`src/lib/schemas/positions.ts`:

```ts
import { z } from 'zod'

export const PositionInput = z.object({
  name: z.string().min(1).max(100),
  rateCents: z.number().int().min(0).max(10_000_000),
})
export type PositionInput = z.infer<typeof PositionInput>

export const UpdatePositionInput = PositionInput.partial().extend({
  id: z.string().min(1),
})
export type UpdatePositionInput = z.infer<typeof UpdatePositionInput>

export const ArchivePositionInput = z.object({ id: z.string().min(1) })
export type ArchivePositionInput = z.infer<typeof ArchivePositionInput>

export const SetWorkerPositionInput = z.object({
  workerId: z.string().min(1),
  positionId: z.string().min(1).nullable(),
})
export type SetWorkerPositionInput = z.infer<typeof SetWorkerPositionInput>
```

- [ ] **Step 4: Service**

`src/server/services/positions.ts` — mirror `structure.ts`/`workers.ts` guard style:

```ts
import { and, eq, isNull, sql } from 'drizzle-orm'
import { HttpError } from '~/lib/errors'
import { canSeeMoney, isAdmin, type SessionContext } from '~/server/context'
import { schema, type Db } from '~/server/db'
import type { Deps } from './deps'
import type {
  ArchivePositionInput, PositionInput, SetWorkerPositionInput, UpdatePositionInput,
} from '~/lib/schemas/positions'

export type PositionView = {
  id: string
  name: string
  rateCents: number
  createdAt: Date
}

// rateCents is money (#5) — the whole view is billing/admin only
export async function listPositions(deps: Deps, _ctx: SessionContext): Promise<PositionView[]> {
  if (!canSeeMoney(_ctx)) throw new HttpError(403, 'FORBIDDEN')
  const rows = await deps.db.select().from(schema.positions)
    .where(isNull(schema.positions.archivedAt))
    .orderBy(schema.positions.name)
  return rows.map((r) => ({ id: r.id, name: r.name, rateCents: r.rateCents, createdAt: r.createdAt }))
}

export async function createPosition(deps: Deps, ctx: SessionContext, input: PositionInput): Promise<PositionView> {
  if (!isAdmin(ctx)) throw new HttpError(403, 'FORBIDDEN')
  const id = crypto.randomUUID()
  const createdAt = deps.now()
  await deps.db.insert(schema.positions)
    .values({ id, name: input.name, rateCents: input.rateCents, createdAt })
  return { id, name: input.name, rateCents: input.rateCents, createdAt }
}

export async function updatePosition(deps: Deps, ctx: SessionContext, input: UpdatePositionInput): Promise<PositionView> {
  if (!isAdmin(ctx)) throw new HttpError(403, 'FORBIDDEN')
  const patch: { name?: string; rateCents?: number } = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.rateCents !== undefined) patch.rateCents = input.rateCents
  // changing the rate affects only NEW intervals — existing rate_cents never moves (#18)
  const rows = await deps.db.update(schema.positions).set(patch)
    .where(and(eq(schema.positions.id, input.id), isNull(schema.positions.archivedAt)))
    .returning()
  if (rows.length === 0) throw new HttpError(404, 'POSITION_NOT_FOUND', 'id')
  const r = rows[0]!
  return { id: r.id, name: r.name, rateCents: r.rateCents, createdAt: r.createdAt }
}

export async function archivePosition(deps: Deps, ctx: SessionContext, input: ArchivePositionInput): Promise<void> {
  if (!isAdmin(ctx)) throw new HttpError(403, 'FORBIDDEN')
  const holders = await deps.db.select({ count: sql<number>`count(*)` })
    .from(schema.humanWorkers)
    .innerJoin(schema.workers, eq(schema.humanWorkers.workerId, schema.workers.id))
    .where(and(eq(schema.humanWorkers.positionId, input.id), isNull(schema.workers.archivedAt)))
  if ((holders[0]?.count ?? 0) > 0) {
    throw new HttpError(409, 'POSITION_IN_USE', 'id', { count: holders[0]!.count })
  }
  const rows = await deps.db.update(schema.positions)
    .set({ archivedAt: deps.now() })
    .where(and(eq(schema.positions.id, input.id), isNull(schema.positions.archivedAt)))
    .returning({ id: schema.positions.id })
  if (rows.length === 0) throw new HttpError(404, 'POSITION_NOT_FOUND', 'id')
}

export async function setWorkerPosition(deps: Deps, ctx: SessionContext, input: SetWorkerPositionInput): Promise<void> {
  if (!isAdmin(ctx)) throw new HttpError(403, 'FORBIDDEN')
  const targets = await deps.db.select({ kind: schema.workers.kind })
    .from(schema.workers)
    .where(and(eq(schema.workers.id, input.workerId), isNull(schema.workers.archivedAt)))
  if (targets.length === 0) throw new HttpError(404, 'NOT_FOUND', 'workerId')
  if (targets[0]!.kind !== 'human') throw new HttpError(400, 'WORKER_NOT_HUMAN', 'workerId')
  if (input.positionId !== null) {
    const pos = await deps.db.select({ id: schema.positions.id })
      .from(schema.positions)
      .where(and(eq(schema.positions.id, input.positionId), isNull(schema.positions.archivedAt)))
    if (pos.length === 0) throw new HttpError(404, 'POSITION_NOT_FOUND', 'positionId')
  }
  await deps.db.update(schema.humanWorkers)
    .set({ positionId: input.positionId })
    .where(eq(schema.humanWorkers.workerId, input.workerId))
}
```

Check the actual export names in `~/server/db` (`schema`, `Db`) and `~/server/context` (`isAdmin`, `canSeeMoney`, `SessionContext`) and use those; the A2 settings task already established `import { schema } from '~/server/db'`.

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run tests/integration/positions.test.ts`
Expected: PASS — 12 tests.

- [ ] **Step 6: Gate + commit**

Run: `npm run check` → exit 0.

```bash
git add src/lib/schemas/positions.ts src/server/services/positions.ts tests/integration/positions.test.ts
git commit -m "feat: positions service"
```

### Task A3: Positions server fns

**Files:**
- Create: `src/server/fns/positions.ts`

**Interfaces:**
- Consumes: the A2 service functions; fn pattern from `src/server/fns/workers.ts` (`[authMw, requireRole('admin')]` for admin mutations, `authMw` only for the money-gated list).
- Produces: `listPositionsFn`, `createPositionFn`, `updatePositionFn`, `archivePositionFn`, `setWorkerPositionFn` — consumed by B2/B3 UI.

- [ ] **Step 1: Write the fns file**

Mirror `src/server/fns/workers.ts` exactly (imports, middleware, handler shape, type re-export block at the bottom):

```ts
import { createServerFn } from '@tanstack/react-start'
import {
  ArchivePositionInput, PositionInput, SetWorkerPositionInput, UpdatePositionInput,
} from '~/lib/schemas/positions'
import { authMw, ctxOf } from '~/server/middleware/authMw'
import { requireRole } from '~/server/middleware/roleGuard'
import { runtimeDeps } from '~/server/runtimeDeps'
import * as svc from '~/server/services/positions'

export const listPositionsFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .handler(({ context }) => svc.listPositions(runtimeDeps(), ctxOf(context)))

export const createPositionFn = createServerFn({ method: 'POST' })
  .middleware([authMw, requireRole('admin')])
  .validator(PositionInput)
  .handler(({ data, context }) => svc.createPosition(runtimeDeps(), ctxOf(context), data))

export const updatePositionFn = createServerFn({ method: 'POST' })
  .middleware([authMw, requireRole('admin')])
  .validator(UpdatePositionInput)
  .handler(({ data, context }) => svc.updatePosition(runtimeDeps(), ctxOf(context), data))

export const archivePositionFn = createServerFn({ method: 'POST' })
  .middleware([authMw, requireRole('admin')])
  .validator(ArchivePositionInput)
  .handler(({ data, context }) => svc.archivePosition(runtimeDeps(), ctxOf(context), data))

export const setWorkerPositionFn = createServerFn({ method: 'POST' })
  .middleware([authMw, requireRole('admin')])
  .validator(SetWorkerPositionInput)
  .handler(({ data, context }) => svc.setWorkerPosition(runtimeDeps(), ctxOf(context), data))

export type { PositionView } from '~/server/services/positions'
```

Check the actual `requireRole` import path in `fns/workers.ts` and copy it verbatim.

- [ ] **Step 2: Gate + commit**

Run: `npm run check` → exit 0 (thin wrappers, no new tests).

```bash
git add src/server/fns/positions.ts
git commit -m "feat: positions server fns"
```

---

### Task B1: Position rate override at interval write

**Files:**
- Modify: `src/server/services/intervals.ts`
- Test: `tests/integration/intervals.test.ts` (extend)

**Interfaces:**
- Consumes: `humanWorkers.positionId` + `positions.rateCents` (A1); existing `liveJob` and the #18 snapshot sites in `createInterval` (row literal ~line 85) and `updateInterval` (~lines 134/146, the `jobChanged` branch).
- Produces: private helper `positionRateCents(db: Db, workerId: string): Promise<number | null>` — live position rate for a human worker, else `null`. No public signature changes.

- [ ] **Step 1: Write the failing tests**

Append to `tests/integration/intervals.test.ts` (reuse its existing job/worker fixture helpers and `ids`):

```ts
describe('position rate override', () => {
  it('new entries snapshot the position rate over the job rate', async () => {
    // ops worker is seeded onto Senior developer (12_000) by A1
    const row = await createInterval(deps(), asUser('operator'), {
      workerId: ids.opWorker, jobId: ids.j1, // j1 is billable at its own rate
      startedAt: at('09:00'), endedAt: at('10:00'), note: null,
    })
    expect(row.rateCents).toBe(12_000)
  })

  it('non-billable job stays null even with a position', async () => {
    const row = await createInterval(deps(), asUser('operator'), {
      workerId: ids.opWorker, jobId: ids.jNonBillable,
      startedAt: at('09:00'), endedAt: at('10:00'), note: null,
    })
    expect(row.rateCents).toBeNull()
  })

  it('worker with no position gets the job rate', async () => {
    const row = await createInterval(deps(), asUser('operator'), {
      workerId: ids.billingWorker, jobId: ids.j1,
      startedAt: at('09:00'), endedAt: at('10:00'), note: null,
    })
    expect(row.rateCents).toBe(/* j1's seeded rate */ 0 /* read from demo.ts and assert the real value */)
  })

  it('$0-billable job + position → position rate', async () => {
    const row = await createInterval(deps(), asUser('operator'), {
      workerId: ids.opWorker, jobId: ids.jZeroRate,
      startedAt: at('09:00'), endedAt: at('10:00'), note: null,
    })
    expect(row.rateCents).toBe(12_000)
  })

  it('changing the job re-snapshots with the current position', async () => {
    const created = await createInterval(deps(), asUser('operator'), {
      workerId: ids.opWorker, jobId: ids.j1,
      startedAt: at('09:00'), endedAt: at('10:00'), note: null,
    })
    const moved = await updateInterval(deps(), asUser('operator'), {
      id: created.id, jobId: ids.jZeroRate,
    })
    expect(moved.rateCents).toBe(12_000)
  })
})
```

Before writing, read `demo.ts` for the real fixture ids and rates: you need a billable job (assert its actual `rateCents`), a `null`-rate job, and a `0`-rate job — if the demo data lacks a zero-rate or non-billable job, create it inline in the test via `db.insert(schema.jobs)` (copy a neighbouring job row's shape) rather than changing the seed. Adjust `at()`, `createInterval`, `updateInterval` call shapes to the file's existing tests — they are the spec.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/integration/intervals.test.ts`
Expected: the new cases FAIL (first one gets the job rate, not 12_000; zero-rate case gets 0).

- [ ] **Step 3: Implement the override**

In `src/server/services/intervals.ts`, add the private helper near `liveJob`:

```ts
// position rate for a human worker, else null; archived positions stop overriding
async function positionRateCents(db: Db, workerId: string): Promise<number | null> {
  const rows = await db.select({ rateCents: schema.positions.rateCents })
    .from(schema.humanWorkers)
    .innerJoin(schema.positions, eq(schema.humanWorkers.positionId, schema.positions.id))
    .where(and(eq(schema.humanWorkers.workerId, workerId), isNull(schema.positions.archivedAt)))
    .get()
  return rows?.rateCents ?? null
}
```

(Match the file's actual imports — `Db`/`schema` may come from `~/server/db`; check the top of `intervals.ts`.)

`createInterval` snapshot site — replace `rateCents: job.billableRateCents` with:

```ts
rateCents:
  job.billableRateCents !== null
    ? ((await positionRateCents(db, input.workerId)) ?? job.billableRateCents)
    : null, // position overrides billable jobs only; non-billable stays null (#positions-plan)
```

`updateInterval`, in the `jobChanged` branch — replace `rateCents: job ? job.billableRateCents : cur.rateCents` with:

```ts
rateCents:
  job === null
    ? cur.rateCents
    : job.billableRateCents !== null
      ? ((await positionRateCents(db, cur.workerId)) ?? job.billableRateCents)
      : null, // snapshot only moves with the job (#18); position rate applies at write time
```

Keep the existing comment and guard order untouched — this is a value swap, not a flow change.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/integration/intervals.test.ts`
Expected: PASS — all pre-existing interval tests (job rate cases without positions stay green: workers with no position fall through to `?? job.billableRateCents`) plus the 5 new ones.

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → exit 0.

```bash
git add src/server/services/intervals.ts tests/integration/intervals.test.ts
git commit -m "feat: position rate override for time entries"
```

### Task B2: Positions admin page

**Files:**
- Create: `src/routes/_app/admin/positions.tsx`
- Modify: `src/routes/_app/admin/route.tsx` (subnav link)
- Generated: `src/routeTree.gen.ts` churn (regenerate with `npm run build`, stage with this commit)

**Interfaces:**
- Consumes: `listPositionsFn`, `createPositionFn`, `updatePositionFn`, `archivePositionFn` (A3); `PositionView`; existing patterns from `src/routes/_app/admin/settings.tsx` (loader + `useRouter` + `router.invalidate`) and the leave plan's C3 leave-types page (TypeCard with null = new).
- Produces: the `/admin/positions` route. New copy (frozen once landed): `Positions`, `Add position`, `Name`, `Rate per hour`, `Save`, `Cancel`, `per hour`, `Archive`.

- [ ] **Step 1: Subnav link**

In `src/routes/_app/admin/route.tsx`, add a `Positions` link **after** `Leave types` (added by the leave plan). If the leave plan has not landed when this task runs, add it after `Settings` and note the ordering in the commit.

- [ ] **Step 2: The page**

`src/routes/_app/admin/positions.tsx` — structure mirrors the leave-types admin page (leave plan C3) / settings page:

- `Route = createFileRoute('/_app/admin/positions')()` with `loader = async () => ({ positions: await listPositionsFn() })`.
- `PositionsPage` renders `h1` (`.admin-head` pattern) + a list of position cards using the `.tree-client` card class, each showing the name, a hint `formatCents(rateCents) per hour`, an inline edit form (name `.field` input, rate as `$`-per-hour text input converted on submit with `Math.round(parseFloat(...) * 100)` — same conversion as the settings page's rate field), and an Archive `Button variant="ghost" size="sm" className="danger"` with the `ArchiveIcon` (reicon-react) — `serverErrorMessage(err)` surfaces `POSITION_IN_USE` inline via `.field-error`.
- An "Add position" card using the `.tree-add` class with the same two fields and a primary submit `Button` (`Plus` icon + `Add position` when new, `Check` + `Save` when editing).
- Form state: local `useState` for the editing card (id or null for add, name, rate text). On submit: `createPositionFn`/`updatePositionFn` then `router.invalidate()`. Empty/NaN rate → client-side field error, never sent.
- On invalid input keep it simple: disable submit unless name is non-empty and rate text is a positive number.

- [ ] **Step 3: Build + verify route tree**

Run: `npm run build`
Expected: exit 0; `src/routeTree.gen.ts` gains the `/admin/positions` route.

- [ ] **Step 4: Gate + commit**

Run: `npm run check` → exit 0.

```bash
git add src/routes/_app/admin/positions.tsx src/routes/_app/admin/route.tsx src/routeTree.gen.ts
git commit -m "feat: positions admin page"
```

---

### Task B3: Assign positions to workers

**Files:**
- Modify: `src/server/services/workers.ts` (`HumanWorkerView` + `listWorkers` humans select)
- Modify: `src/lib/schemas/workers.ts` (`InviteInput.positionId`)
- Modify: `src/server/services/invites.ts` (validate + persist position on invite)
- Modify: `src/routes/_app/admin/workers.tsx` (loader passes positions)
- Modify: `src/components/workerRoster.tsx` (Position column + select)
- Modify: `src/components/inviteForm.tsx` (optional position select)
- Test: `tests/integration/invites.test.ts` (extend), `tests/integration/positions.test.ts` (extend)

**Interfaces:**
- Consumes: `PositionView` + `setWorkerPositionFn` (A3); `listPositionsFn`.
- Produces: `HumanWorkerView.positionId: string | null`; `InviteInput.positionId?: string | null`.

- [ ] **Step 1: Extend the workers view (write the failing test first)**

Append to `tests/integration/positions.test.ts`:

```ts
it('listWorkers carries positionId for humans', async () => {
  const { listWorkers } = await import('~/server/services/workers')
  const admin = asUser('admin')
  const rows = await listWorkers(deps(), admin)
  const ops = rows.find((r) => r.kind === 'human' && r.workerId === ids.opWorker)
  expect(ops && 'positionId' in ops ? ops.positionId : undefined).toBe(ids.posSenior)
})
```

In `src/server/services/workers.ts`: add `positionId: string | null` to `HumanWorkerView`; in `listWorkers`, the humans query select adds `positionId: schema.humanWorkers.positionId` and the push spreads it into the view (`positionId: h.positionId`). Check `tests/integration/workerRoster.test.ts` (and any other suite constructing `HumanWorkerView` literals) — add the key where tsc demands it.

- [ ] **Step 2: Invite flow (failing tests first)**

Append to `tests/integration/invites.test.ts`, mirroring its existing invite test setup (mocked auth etc.):

```ts
it('invite with positionId persists it on the human worker', async () => {
  // copy the file's existing invite happy-path setup, add positionId: ids.posSenior
  const res = await inviteUser(inviteDeps(), asUser('admin'), {
    email: 'positioned@example.com', name: 'Positioned', roles: ['operator'],
    supervisorId: null, positionId: ids.posSenior,
  })
  const row = await db.select().from(schema.humanWorkers).where(eq(schema.humanWorkers.userId, /* res.userId or lookup by email as the existing tests do */ ''))
  expect(row[0]?.positionId).toBe(ids.posSenior)
})

it('invite with unknown position → POSITION_NOT_FOUND before user creation', async () => {
  await expect(
    inviteUser(inviteDeps(), asUser('admin'), {
      email: 'nope@example.com', name: 'Nope', roles: ['operator'],
      supervisorId: null, positionId: 'pos-nope',
    }),
  ).rejects.toMatchObject({ status: 404, code: 'POSITION_NOT_FOUND', field: 'positionId' })
})
```

Then: `src/lib/schemas/workers.ts` `InviteInput` gains `positionId: z.string().min(1).nullable().optional()`. `src/server/services/invites.ts` `inviteUser`: after the supervisor validation, when `input.positionId != null` look up a live position and throw `HttpError(404, 'POSITION_NOT_FOUND', 'positionId')` if absent (this must run **before** `auth.api.createUser` so no user is created for a bad request); the `humanWorkers` insert in the batch adds `positionId: input.positionId ?? null`.

- [ ] **Step 3: Roster Position column**

`src/routes/_app/admin/workers.tsx`: loader becomes `{ workers: await listWorkersFn(), positions: await listPositionsFn() }`; pass `positions` to `WorkerRoster` and `InviteForm`.

`src/components/workerRoster.tsx` (humans table only): new `Position` column header; each human row's cell renders a `<select>` (element-styled, like the Supervisor select — reuse the `.roster select` width rule or add `width: 200px` inline via a shared class) with `value={w.positionId ?? ''}`, first option `— none —` (`value=""` → null), then `positions.map(p => <option value={p.id}>{p.name}</option>)`; `onChange` calls `setWorkerPositionFn({ data: { workerId: w.workerId, positionId: e.target.value || null } })` then `onRefresh()`. Follow the file's existing supervisor-select error handling (`errAfter` pattern) for failures. Component props gain `positions: PositionView[]` (import the type from `~/server/services/positions`).

`src/components/inviteForm.tsx`: optional position select after the supervisor field (label `Position`, `— none —` default), submitted as `positionId: value || null` only when the field is rendered; props gain `positions`.

- [ ] **Step 4: Run tests + gate**

Run: `npx vitest run tests/integration/positions.test.ts tests/integration/invites.test.ts`
Expected: PASS.

Run: `npm run check` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/workers.ts src/lib/schemas/workers.ts src/server/services/invites.ts \
  src/routes/_app/admin/workers.tsx src/components/workerRoster.tsx src/components/inviteForm.tsx \
  tests/integration/positions.test.ts tests/integration/invites.test.ts
git commit -m "feat: assign positions to workers"
```

---

### Task C1: Positions wrap-up

**Files:**
- Modify: `CLAUDE.md` (Where-things-are table)

- [ ] **Step 1: CLAUDE.md row**

After the org-settings rows (added by the defaults plan), add:

```markdown
| Positions (rate override) | `src/lib/schemas/positions.ts`, `src/server/services/positions.ts`, `src/server/fns/positions.ts` |
| Positions admin page | `src/routes/_app/admin/positions.tsx` |
```

- [ ] **Step 2: Full gates**

Run: `npm run check` → exit 0.
Run: `npm run test:contract` → exit 0 (belt-and-braces; services already covered; manifest untouched).
Run: `npm run build` → exit 0, no `routeTree.gen.ts` churn (B2 already regenerated).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore: positions wrap-up"
```

---

## Done criteria

- A position has a name and a cents/hour rate; admins create, edit, archive them on `/admin/positions`.
- One position per human worker, assignable from the roster select and at invite time; agents rejected (`WORKER_NOT_HUMAN`).
- New intervals on billable jobs snapshot `position rate ?? job rate`; non-billable jobs stay `null`; `$0` jobs take the position rate; job changes re-snapshot. Existing intervals never move (#18).
- Archived positions stop overriding and cannot be assigned; archiving is blocked while live workers hold one (`POSITION_IN_USE`).
- `rateCents` reaches only billing/admin (`listPositions` money gate); operators never see it.
- Rate precedence documented and implemented: explicit job input → org default (defaults plan B1) → **position override at interval write when billable**.
- `npm run check` exit 0 at every commit; `tests/contract/**` untouched; no new dependencies; copy freeze respected (only the B2/B3 copy list is new).
- eyeball steps (admin positions page, roster select, invite form) deferred to human review, as in prior plans.

## Follow-up notes (not tasks)

- The leave plan's request form could later prefill hours-per-day from `defaultDayMinutes`; positions could later appear in operator-facing profiles (names only). Neither is in scope.



