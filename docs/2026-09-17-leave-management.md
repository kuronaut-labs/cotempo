# Leave Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Employees request leave in hours (annual, paid/unpaid sick, custom types), the org configures how each type accrues (AU/US/EU/UK-friendly), billing/admin moderate requests like weekly approvals, and leave shows up in reports and CSV.

**Architecture:** A policy table (`leave_types`) drives a pure accrual engine (`src/lib/leaveMath.ts`) that computes balances from policy + hire date + (optionally) worked minutes — no materialized ledger. Requests are a small state machine (submitted → approved/rejected, cancellable) with an audit trail, mirroring the weekly-approvals service. Leave is parallel to time entries: non-blocking, reported side by side.

**Tech Stack:** Drizzle (new tables + `npm run db:generate`), Zod v4 schemas in `src/lib/schemas/leave.ts`, service in `src/server/services/leave.ts`, fns in `src/server/fns/leave.ts`, TanStack Router routes, TanStack Form + `applyServerError`, existing Button/Chip primitives.

## Global Constraints

- **No new dependencies.** Everything uses what's in package.json.
- **Never touch `tests/contract/**`** — the manifest check fails on any byte change or new file there. All new tests go in `tests/unit/` and `tests/integration/`. Gate is `npm run check` (exit 0). Optionally also `npm run test:contract` — must stay green with zero new files.
- **Protected:** `.wayfinder/**`, `docs/**` (except this file), `drizzle/migrations/**` is generated — edit `src/drizzle/schema.ts` then run `npm run db:generate`, commit what it emits. `src/routeTree.gen.ts` churns when routes are added — commit its churn with the route change that caused it, never hand-edit.
- **All durations are integer minutes** (never fractional hours in storage; minutes never round). Display via `formatHmm` (`src/lib/money.ts`). Hours inputs in UI × 60.
- **Days are org-tz ISO date strings** `'YYYY-MM-DD'` (like `approvals.weekStart`); instants stay integer ms via `integer(..., { mode: 'timestamp_ms' })` and app-supplied `deps.now()`.
- **Money rule (#5/#18):** leave has no money. Never introduce cents anywhere in leave code.
- **Service shape (#10/#20):** business logic in `src/server/services/leave.ts` as `(deps, ctx, input)` functions; `src/server/fns/leave.ts` are thin `createServerFn` wrappers with `authMw` + validator; role checks run in the middleware layer AND again in the service (`hasRole`).
- **Errors (#25):** `HttpError(status, CODE, field?, data?)` from `src/lib/errors.ts`, upper snake case. New codes this plan adds: `LEAVE_TYPE_NOT_FOUND` 404 (`typeId`), `LEAVE_NOT_FOUND` 404 (`id`), `LEAVE_OVERLAP` 409 (`data.conflictingId`), `LEAVE_INSUFFICIENT_BALANCE` 409 (`typeId`, `data.availableMinutes`), plus re-used `UNAUTHENTICATED`, `FORBIDDEN`, `FORBIDDEN_TARGET`, `NOT_FOUND`, `END_BEFORE_START` (`endDay`), `SELF_APPROVAL`, `INVALID_TRANSITION`.
- **Copy freeze:** existing user-visible strings never change. All strings in this plan's new screens are new copy and land verbatim as written here.
- **Soft delete (#9):** leave rows are never hard-deleted. Rejected/cancelled requests stay for audit; `leave_types` gets `archivedAt` (requests keep pointing at archived types; reads resolve the name).
- **Node:** machine uses mise, not nvm (node 24 active by default). Dev server: `npm run dev -- --port 3123 --strictPort`. Seeded logins: `admin@example.com` (password in `.dev.vars` `ADMIN_PASSWORD`), `billing@example.com` / `ops@example.com` (`demo-password-123`).
- **Design system:** `docs/DESIGN.md` is the spec; reuse `.panel`, `.field`, `.entryform*`, `.intervallist`, `.btn`/`Button`, `Chip`/`StatusChip`, `[data-tip]`; icons from `reicon-react` (Outline, currentColor, sizes 13/14/15). New CSS uses tokens only, `border-radius: var(--radius-*)`, shadows `var(--shadow-*)`.

## Locked decisions (from user)

1. **Leave is measured in hours** — stored as integer minutes per day (e.g. 480 = 8h day, 240 = half day). Requests span whole days with `minutesPerDay`.
2. **Accrual is policy-driven and flexible** (AU/US/EU/UK now, world later): per type choose `annual_allotment` (grant at year start — US-style PTO), `monthly_prorata` (AU/EU style, `minutesPerYear` spread monthly), or `per_hours_worked` (UK part-time 12.07%: leave minutes per 10,000 worked minutes). Year basis per type: `calendar` or `anniversary` (from hire date).
3. **Org-wide policies only** — no per-worker overrides.
4. **Moderation by billing + admin**, same model as weekly approvals: `SELF_APPROVAL` blocked, reject requires a reason, full event audit.
5. **Parallel, non-blocking** — approved leave never blocks or errors time entries; no red flags added to entry flow.
6. **Reporting:** new "Leave" subtab in `/reports` (billing/admin) + operator "My leave" on a new `/leave` route + moderation queue on `/leave` + CSV export.
7. **Hire date** = `workers.createdAt` (no separate hire column; noted for a future ticket).

## File Structure

| Concern | File |
|---|---|
| Tables | `src/drizzle/schema.ts` (add `leaveTypes`, `leaveRequests`, `leaveEvents`) |
| Migration | `drizzle/migrations/` (generated by `npm run db:generate`) |
| Pure accrual math | `src/lib/leaveMath.ts` (unit-tested, no deps) |
| Zod inputs | `src/lib/schemas/leave.ts` |
| Service | `src/server/services/leave.ts` |
| Server fns | `src/server/fns/leave.ts` |
| Leave route | `src/routes/_app/leave.tsx` (new; nav link + icon) |
| Types admin | `src/routes/_app/admin/leave.tsx` (new; admin subnav "Leave types") |
| Reports tab | `src/routes/_app/reports.tsx` (add subtab), `src/server/services/leave.ts` (`leaveReport`), `src/server/services/exports.ts` (CSV view) |
| Styles | `src/styles/global.css` (small `.leave*` + `.leavetypes*` blocks) |
| Seed | `src/server/fixtures/demo.ts` (types + sample requests) |
| Tests | `tests/unit/leaveMath.test.ts`, `tests/integration/leave.service.test.ts` |

Waves: **A** schema + math (A1–A3) · **B** service + fns (B1–B3) · **C** UI (C1–C4) · **D** finalize (D1).

---

## Wave A — foundation

### Task A1: schema, migration, seed

**Files:**
- Modify: `src/drizzle/schema.ts` (append after `approvalEvents`)
- Create: `drizzle/migrations/<generated>` via `npm run db:generate`
- Modify: `src/server/fixtures/demo.ts` (seed types + requests)
- Test: `tests/integration/leave.service.test.ts` (created in B1; A1 only needs the migration to apply)

**Interfaces:**
- Produces tables used by every later task:
  - `leaveTypes { id: text pk; key: text notNull unique; name: text notNull; paid: integer boolean notNull default true; accrualMethod: text notNull default 'monthly_prorata' ('annual_allotment' | 'monthly_prorata' | 'per_hours_worked'); minutesPerYear: integer notNull default 0; accrualRatePer10k: integer notNull default 0 (leave minutes per 10,000 worked minutes); maxCarryOverMinutes: integer notNull default 0; yearBasis: text notNull default 'calendar' ('calendar' | 'anniversary'); archivedAt: timestamp_ms nullable; createdAt; updatedAt }`
  - `leaveRequests { id: text pk; workerId: text notNull references workers.id; typeId: text notNull references leaveTypes.id; startDay: text notNull ('YYYY-MM-DD' org tz); endDay: text notNull; minutesPerDay: integer notNull; status: text notNull default 'submitted' ('submitted' | 'approved' | 'rejected' | 'cancelled'); reason: text nullable; submittedAt: timestamp_ms notNull; submittedBy: text notNull; decidedAt: timestamp_ms nullable; decidedBy: text nullable; decisionReason: text nullable }` + index on `(workerId, status)` and `(status)`.
  - `leaveEvents { id: text pk; requestId: text notNull references leaveRequests.id; kind: text notNull ('submit' | 'approve' | 'reject' | 'cancel'); actorWorkerId: text notNull; reason: text nullable; at: timestamp_ms notNull }`.

- [ ] **Step 1: Add the tables to `src/drizzle/schema.ts`**

Append after the `approvalEvents` table, matching the file's existing helpers (`ts` for `integer(..., { mode: 'timestamp_ms' })`):

```ts
// Leave -----------------------------------------------------------------
// minutesPerYear / minutesPerDay / accrualRatePer10k are integer minutes;
// minutes never round (#23-adjacent). accrualRatePer10k = leave minutes
// accrued per 10,000 worked minutes (12.07% UK part-time = 1207).

export const leaveTypes = sqliteTable('leave_types', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  paid: integer('paid', { mode: 'boolean' }).notNull().default(true),
  accrualMethod: text('accrual_method').notNull().default('monthly_prorata'),
  minutesPerYear: integer('minutes_per_year').notNull().default(0),
  accrualRatePer10k: integer('accrual_rate_per_10k').notNull().default(0),
  maxCarryOverMinutes: integer('max_carry_over_minutes').notNull().default(0),
  yearBasis: text('year_basis').notNull().default('calendar'),
  archivedAt: ts('archived_at'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
})

export const leaveRequests = sqliteTable('leave_requests', {
  id: text('id').primaryKey(),
  workerId: text('worker_id').notNull().references(() => workers.id),
  typeId: text('type_id').notNull().references(() => leaveTypes.id),
  startDay: text('start_day').notNull(), // 'YYYY-MM-DD' org tz, like approvals.weekStart
  endDay: text('end_day').notNull(),
  minutesPerDay: integer('minutes_per_day').notNull(),
  status: text('status').notNull().default('submitted'),
  reason: text('reason'),
  submittedAt: ts('submitted_at').notNull(),
  submittedBy: text('submitted_by').notNull(),
  decidedAt: ts('decided_at'),
  decidedBy: text('decided_by'),
  decisionReason: text('decision_reason'),
}, (t) => [index('leave_requests_worker_status_idx').on(t.workerId, t.status), index('leave_requests_status_idx').on(t.status)])

export const leaveEvents = sqliteTable('leave_events', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull().references(() => leaveRequests.id),
  kind: text('kind').notNull(), // submit | approve | reject | cancel
  actorWorkerId: text('actor_worker_id').notNull(),
  reason: text('reason'),
  at: ts('at').notNull(),
})
```

If `index` is not already imported from 'drizzle-orm/sqlite-core' at the top of the file, add it to the existing import list (the approvals table already uses `uniqueIndex`; `index` comes from the same module).

- [ ] **Step 2: Generate + apply the migration**

Run: `npm run db:generate`
Expected: a new migration file appears under `drizzle/migrations/` (add-leave tables); no warnings about data loss.

Run: `npm run db:migrate:local && npm run db:seed`
Expected: applies cleanly; seed still passes (it does not know about leave yet — that's Step 3).

- [ ] **Step 3: Seed fixtures in `src/server/fixtures/demo.ts`**

Read the file first and follow its existing fixture style (`iv(...)`, ids map, `at(...)` helper). Add:

```ts
// Leave types: AU/EU-style annual (monthly pro-rata, calendar year, 20 days),
// US-style sick (annual allotment, anniversary year, 10 days), unpaid (no accrual).
const lt = (id: string, key: string, name: string, paid: boolean, method: string, minutesPerYear: number, carry: number, yearBasis = 'calendar') => ({
  id,
  key,
  name,
  paid,
  accrualMethod: method,
  minutesPerYear,
  accrualRatePer10k: 0,
  maxCarryOverMinutes: carry,
  yearBasis,
  createdAt: at(0),
  updatedAt: at(0),
})
export const leaveTypeRows = [
  lt('lt-annual', 'annual', 'Annual leave', true, 'monthly_prorata', 20 * 480, 5 * 480),
  lt('lt-sick', 'sick', 'Sick leave (paid)', true, 'annual_allotment', 10 * 480, 0, 'anniversary'),
  lt('lt-unpaid', 'unpaid', 'Unpaid leave', false, 'annual_allotment', 0, 0),
]
```

And one sample request inserted in the same seeding pass the file already uses (reuse its `ids` map for a human worker, e.g. `ids.opWorker`):

```ts
export const leaveRequestRows = (ids: { opWorker: string }) => [
  {
    id: 'lr-demo-1',
    workerId: ids.opWorker,
    typeId: 'lt-annual',
    startDay: '2026-09-24',
    endDay: '2026-09-25',
    minutesPerDay: 480,
    status: 'approved',
    reason: 'Family trip',
    submittedAt: at(-14 * 86_400_000),
    submittedBy: ids.opWorker,
    decidedAt: at(-13 * 86_400_000),
    decidedBy: ids.billingWorker,
    decisionReason: 'Enjoy',
  },
]
```

Match however `demo.ts` is consumed by `npm run db:seed` — if it exports a `seed(db)`-style function, insert these rows inside it with `db.insert(leaveTypes).values(leaveTypeRows)` etc. If `ids.billingWorker` does not exist under that name, use the actual billing worker id constant the file already defines.

- [ ] **Step 4: Gate + commit**

Run: `npm run check` → exit 0 (schema compiles; no contract files touched).
Run: `npm run db:migrate:local && npm run db:seed` → seeds leave rows without error.

```bash
git add src/drizzle/schema.ts drizzle/migrations src/server/fixtures/demo.ts
git commit -m "feat: leave schema, migration, and seed"
```

### Task A2: Zod schemas

**Files:**
- Create: `src/lib/schemas/leave.ts`
- Test: none (schemas are validated through the service tests; keep this file pure declarations)

**Interfaces:**
- Produces (used by service, fns, and UI forms — names matter, later tasks import these):
  - `type AccrualMethod = 'annual_allotment' | 'monthly_prorata' | 'per_hours_worked'`
  - `type YearBasis = 'calendar' | 'anniversary'`
  - `LeaveTypeInput` = `{ id?: string; key: string; name: string; paid: boolean; accrualMethod: AccrualMethod; minutesPerYear: number; accrualRatePer10k: number; maxCarryOverMinutes: number; yearBasis: YearBasis }`
  - `LeaveRequestInput` = `{ workerId?: string; typeId: string; startDay: string; endDay: string; minutesPerDay: number; reason?: string }`
  - `ApproveLeaveInput` = `{ id: string; comment?: string }`
  - `RejectLeaveInput` = `{ id: string; reason: string }`
  - `CancelLeaveInput` = `{ id: string }`
  - each exported as `const` schema + `type` with the same name (house style).

- [ ] **Step 1: Write `src/lib/schemas/leave.ts`**

Follow the style of `src/lib/schemas/structure.ts` (zod v4, exported const + type pairs):

```ts
import { z } from 'zod'

export const AccrualMethodEnum = z.enum(['annual_allotment', 'monthly_prorata', 'per_hours_worked'])
export type AccrualMethod = z.infer<typeof AccrualMethodEnum>

export const YearBasisEnum = z.enum(['calendar', 'anniversary'])
export type YearBasis = z.infer<typeof YearBasisEnum>

const dayIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const minutes = (min: number, max: number) => z.number().int().min(min).max(max)

export const LeaveTypeInput = z.object({
  id: z.string().min(1).optional(),
  key: z.string().regex(/^[a-z0-9-]{1,40}$/, 'lowercase letters, digits, dashes'),
  name: z.string().min(1).max(100),
  paid: z.boolean(),
  accrualMethod: AccrualMethodEnum,
  minutesPerYear: minutes(0, 100_000),
  accrualRatePer10k: minutes(0, 10_000),
  maxCarryOverMinutes: minutes(0, 100_000),
  yearBasis: YearBasisEnum,
})
export type LeaveTypeInput = z.infer<typeof LeaveTypeInput>

export const LeaveRequestInput = z
  .object({
    workerId: z.string().min(1).optional(),
    typeId: z.string().min(1),
    startDay: dayIso,
    endDay: dayIso,
    minutesPerDay: minutes(15, 720),
    reason: z.string().max(500).optional(),
  })
  .refine((v) => v.endDay >= v.startDay, { message: 'Ends before it starts', path: ['endDay'] })
export type LeaveRequestInput = z.infer<typeof LeaveRequestInput>

export const ApproveLeaveInput = z.object({ id: z.string().min(1), comment: z.string().max(500).optional() })
export type ApproveLeaveInput = z.infer<typeof ApproveLeaveInput>

export const RejectLeaveInput = z.object({ id: z.string().min(1), reason: z.string().min(1).max(500) })
export type RejectLeaveInput = z.infer<typeof RejectLeaveInput>

export const CancelLeaveInput = z.object({ id: z.string().min(1) })
export type CancelLeaveInput = z.infer<typeof CancelLeaveInput>
```

- [ ] **Step 2: Gate + commit**

Run: `npm run check` → exit 0.

```bash
git add src/lib/schemas/leave.ts
git commit -m "feat: leave input schemas"
```

### Task A3: pure accrual engine (TDD)

**Files:**
- Create: `src/lib/leaveMath.ts`
- Test: `tests/unit/leaveMath.test.ts` (write FIRST)

**Interfaces:**
- Produces (the heart of balances; service and reports consume):
  - `type LeavePolicy = { key: string; accrualMethod: AccrualMethod; minutesPerYear: number; accrualRatePer10k: number; maxCarryOverMinutes: number; yearBasis: YearBasis }`
  - `type AccrualYear = { startDay: string; endDay: string }` (endDay inclusive; final year ends `'9999-12-31'` marker is NOT used — see `accrualYears`)
  - `accrualYears(policy: LeavePolicy, accrualStartDay: string, asOfDay: string): AccrualYear[]` — completed + current year windows from hire/start to asOf (inclusive); `calendar` basis starts at the Jan 1 of the start year; `anniversary` at the start day itself.
  - `grantedMinutes(policy: LeavePolicy, yearStartDay: string, accrualStartDay: string, asOfDay: string, workedMinutesInYear: number): number` — minutes granted so far in that year window: `annual_allotment` = full `minutesPerYear` once the window has begun; `monthly_prorata` = `Math.floor((minutesPerYear * completedMonths) / 12)` where completedMonths counts full months elapsed in-window (a partial month grants nothing); `per_hours_worked` = `Math.floor((workedMinutesInYear * accrualRatePer10k) / 10_000)`.
  - `carryOverMinutes(policy: LeavePolicy, unusedMinutesAtYearEnd: number): number` = `Math.min(unusedMinutesAtYearEnd, maxCarryOverMinutes)`.
  - `computeAvailableMinutes(policy, accrualStartDay, asOfDay, usedMinutesByYear: number[], workedMinutesByYear: number[]): number` — folds years oldest→current: `available = granted + carriedIn − used`; at each completed year boundary `carriedIn_next = carryOverMinutes(policy, available)`; returns current-year available.
  - `daysInclusive(startDay: string, endDay: string): number` — day count inclusive of both ends (`(end−start)/86_400_000 + 1`, ISO strings compare and subtract as UTC).
  - `requestMinutes(startDay, endDay, minutesPerDay): number` = `daysInclusive * minutesPerDay`.

- [ ] **Step 1: Write the failing tests — `tests/unit/leaveMath.test.ts`**

Follow the style of an existing pure test (`tests/unit/miniStrip.test.ts` or `tests/unit/week.test.ts` — node env, `~` alias, vitest `expect/it/describe` from 'vitest'):

```ts
import { describe, expect, it } from 'vitest'
import {
  accrualYears, carryOverMinutes, computeAvailableMinutes, daysInclusive,
  grantedMinutes, requestMinutes, type LeavePolicy,
} from '~/lib/leaveMath'

const annual20d: LeavePolicy = { key: 'annual', accrualMethod: 'monthly_prorata', minutesPerYear: 20 * 480, accrualRatePer10k: 0, maxCarryOverMinutes: 5 * 480, yearBasis: 'calendar' }
const sick10d: LeavePolicy = { key: 'sick', accrualMethod: 'annual_allotment', minutesPerYear: 10 * 480, accrualRatePer10k: 0, maxCarryOverMinutes: 0, yearBasis: 'anniversary' }
const ukPartTime: LeavePolicy = { key: 'annual', accrualMethod: 'per_hours_worked', minutesPerYear: 0, accrualRatePer10k: 1207, maxCarryOverMinutes: 0, yearBasis: 'calendar' }

describe('accrualYears', () => {
  it('calendar basis snaps to Jan 1', () => {
    expect(accrualYears(annual20d, '2025-07-15', '2026-03-10')).toEqual([
      { startDay: '2025-01-01', endDay: '2025-12-31' },
      { startDay: '2026-01-01', endDay: '2026-12-31' },
    ])
  })
  it('anniversary basis uses the start day', () => {
    expect(accrualYears(sick10d, '2025-03-01', '2026-04-02')).toEqual([
      { startDay: '2025-03-01', endDay: '2026-02-28' },
      { startDay: '2026-03-01', endDay: '2027-02-28' },
    ])
  })
  it('stops at asOf year', () => {
    const ys = accrualYears(annual20d, '2024-02-01', '2026-09-17')
    expect(ys.at(-1)?.startDay).toBe('2026-01-01')
    expect(ys).toHaveLength(3)
  })
})

describe('grantedMinutes', () => {
  it('annual_allotment grants the full year once the window began', () => {
    expect(grantedMinutes(sick10d, '2026-03-01', '2025-03-01', '2026-03-02', 0)).toBe(10 * 480)
  })
  it('monthly_prorata grants only completed months', () => {
    expect(grantedMinutes(annual20d, '2026-01-01', '2025-07-15', '2026-04-01', 0)).toBe(Math.floor((20 * 480 * 3) / 12))
    expect(grantedMinutes(annual20d, '2026-01-01', '2025-07-15', '2026-01-31', 0)).toBe(0)
  })
  it('per_hours_worked scales worked minutes', () => {
    expect(grantedMinutes(ukPartTime, '2026-01-01', '2025-07-15', '2026-12-31', 10_000)).toBe(1207)
    expect(grantedMinutes(ukPartTime, '2026-01-01', '2025-07-15', '2026-12-31', 8_280)).toBe(999) // floor(8280*1207/10000)
  })
  it('monthly_prorata first year prorates from hire, not Jan 1', () => {
    // hired 2025-07-15, calendar basis: first window starts 2025-01-01 but the
    // worker only accrues from hire — 0 completed in-window months before hire month.
    expect(grantedMinutes(annual20d, '2025-01-01', '2025-07-15', '2025-12-31', 0)).toBe(Math.floor((20 * 480 * 5) / 12))
  })
})

describe('carryOverMinutes + computeAvailableMinutes', () => {
  it('caps carry-over', () => {
    expect(carryOverMinutes(annual20d, 8 * 480)).toBe(5 * 480)
    expect(carryOverMinutes(sick10d, 8 * 480)).toBe(0)
  })
  it('folds years and applies the cap once per boundary', () => {
    // Year 1: granted 8000 (5 months of 160h at hire 2025-07-15 → 8000), used 6000 → 2000 left, carry 2000 (under cap)
    // Year 2 (current, asOf 2026-09-17): granted floor(9600*8/12)=6400 so far + carry 2000 → 8400 available
    const used = [6_000, 0]
    const worked = [0, 0]
    const avail = computeAvailableMinutes(annual20d, '2025-07-15', '2026-09-17', used, worked)
    expect(avail).toBe(8_400)
  })
  it('loses minutes above the carry cap at the boundary', () => {
    // Year 1 granted 9600 (full), used 0 → 9600 left, carry capped at 2400
    const avail = computeAvailableMinutes(annual20d, '2024-01-05', '2026-03-01', [0, 0], [0, 0])
    // Year 2 (2025): granted 9600 + 2400 carry = 12000, used 0, carry min(12000,2400)=2400
    // Year 3 (2026, current): granted floor(9600*2/12)=1600 + 2400 = 4000
    expect(avail).toBe(4_000)
  })
  it('per_hours_worked uses worked minutes per year', () => {
    const avail = computeAvailableMinutes(ukPartTime, '2025-01-01', '2026-06-30', [0, 1_207], [10_000, 10_000])
    // Y1: 1207 granted − 0 used = 1207, carry cap 0 → 0 carried; Y2: 1207 granted − 1207 used = 0
    expect(avail).toBe(0)
  })
})

describe('daysInclusive + requestMinutes', () => {
  it('counts both ends', () => {
    expect(daysInclusive('2026-09-24', '2026-09-25')).toBe(2)
    expect(daysInclusive('2026-09-24', '2026-09-24')).toBe(1)
    expect(daysInclusive('2026-02-27', '2026-03-02')).toBe(4)
  })
  it('multiplies by minutes per day', () => {
    expect(requestMinutes('2026-09-24', '2026-09-25', 480)).toBe(960)
    expect(requestMinutes('2026-09-24', '2026-09-24', 240)).toBe(240)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/leaveMath.test.ts`
Expected: FAIL — cannot resolve `~/lib/leaveMath`.

- [ ] **Step 3: Implement `src/lib/leaveMath.ts`**

```ts
import type { AccrualMethod, YearBasis } from '~/lib/schemas/leave'

export type LeavePolicy = {
  key: string
  accrualMethod: AccrualMethod
  minutesPerYear: number
  accrualRatePer10k: number
  maxCarryOverMinutes: number
  yearBasis: YearBasis
}

export type AccrualYear = { startDay: string; endDay: string }

const MS_PER_DAY = 86_400_000
const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`)
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
const febEnd = (y: number) => (isLeap(y) ? '02-29' : '02-28')

export function accrualYears(policy: LeavePolicy, accrualStartDay: string, asOfDay: string): AccrualYear[] {
  const start = dayMs(accrualStartDay)
  const asOf = dayMs(asOfDay)
  if (asOf < start) return []
  const years: AccrualYear[] = []
  if (policy.yearBasis === 'calendar') {
    const y0 = Number(accrualStartDay.slice(0, 4))
    for (let y = y0; ; y++) {
      const s = `${y}-01-01`
      if (dayMs(s) > asOf) break
      years.push({ startDay: s, endDay: `${y}-12-31` })
    }
  } else {
    const y0 = Number(accrualStartDay.slice(0, 4))
    const md = accrualStartDay.slice(5)
    for (let y = y0; ; y++) {
      const s = y === y0 ? accrualStartDay : `${y}-${md}`
      if (dayMs(s) > asOf) break
      const endYear = s.slice(5, 7) === '02' && s.slice(8) === '29' ? y + 1 : (Number(s.slice(0, 4)) + 1)
      years.push({ startDay: s, endDay: `${endYear}-${md}` }) // next window starts same month-day
    }
    // endDay is exclusive in spirit; callers only use startDay + membership.
    years.forEach((y, i) => { y.endDay = years[i + 1]?.startDay ?? y.endDay })
  }
  return years
}

function completedMonthsInWindow(yearStartDay: string, accrualStartDay: string, asOfDay: string): number {
  const hire = dayMs(accrualStartDay)
  const effective = Math.max(dayMs(yearStartDay), hire)
  let months = (Number(asOfDay.slice(0, 4)) - Number(isoDay(effective).slice(0, 4))) * 12
  months += Number(asOfDay.slice(5, 7)) - Number(isoDay(effective).slice(5, 7))
  if (Number(asOfDay.slice(8, 10)) < Number(isoDay(effective).slice(8, 10))) months -= 1
  return Math.max(0, months)
}

export function grantedMinutes(
  policy: LeavePolicy, yearStartDay: string, accrualStartDay: string, asOfDay: string, workedMinutesInYear: number,
): number {
  if (dayMs(asOfDay) < dayMs(Math.max(yearStartDay, accrualStartDay))) return 0
  if (policy.accrualMethod === 'annual_allotment') return policy.minutesPerYear
  if (policy.accrualMethod === 'monthly_prorata') {
    const months = completedMonthsInWindow(yearStartDay, accrualStartDay, asOfDay)
    return Math.floor((policy.minutesPerYear * months) / 12)
  }
  return Math.floor((workedMinutesInYear * policy.accrualRatePer10k) / 10_000)
}

export function carryOverMinutes(policy: LeavePolicy, unusedMinutesAtYearEnd: number): number {
  return Math.min(Math.max(0, unusedMinutesAtYearEnd), policy.maxCarryOverMinutes)
}

export function computeAvailableMinutes(
  policy: LeavePolicy, accrualStartDay: string, asOfDay: string,
  usedMinutesByYear: number[], workedMinutesByYear: number[],
): number {
  const years = accrualYears(policy, accrualStartDay, asOfDay)
  let available = 0
  years.forEach((y, i) => {
    const carried = i === 0 ? 0 : carryOverMinutes(policy, available)
    available = carried + grantedMinutes(policy, y.startDay, accrualStartDay, asOfDay, workedMinutesByYear[i] ?? 0) - (usedMinutesByYear[i] ?? 0)
  })
  return Math.max(0, available)
}

export function daysInclusive(startDay: string, endDay: string): number {
  return Math.round((dayMs(endDay) - dayMs(startDay)) / MS_PER_DAY) + 1
}

export function requestMinutes(startDay: string, endDay: string, minutesPerDay: number): number {
  return daysInclusive(startDay, endDay) * minutesPerDay
}
```

Note: the doc comment above `accrualYears`'s anniversary branch explains the endDay convention (endDay = next window's startDay) so implementers don't "fix" it. The test only asserts `startDay` values and length for anniversary — that is deliberate.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/leaveMath.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → exit 0.

```bash
git add src/lib/leaveMath.ts tests/unit/leaveMath.test.ts
git commit -m "feat: leave accrual engine"
```

## Wave B — service + fns

### Task B1: leave service — types, balances, my leave

**Files:**
- Create: `src/server/services/leave.ts`
- Test: `tests/integration/leave.service.test.ts` (write FIRST, failing)

**Interfaces:**
- Consumes: `Deps` from `./deps` (`{ db, tz, now }`), `SessionContext` + `hasRole` from `~/server/context`, `assertCanEditWorker`/`assertCanViewWorker` from `~/server/guards/worker`, tables imported exactly the way `src/server/services/approvals.ts` imports its tables (copy that import statement and add `intervals`, `leaveEvents`, `leaveRequests`, `leaveTypes`), `HttpError` from `~/lib/errors`, everything from A3.
- Produces (B2/B3/C* import these):
  - `type LeaveTypeView = { id: string; key: string; name: string; paid: boolean; accrualMethod: 'annual_allotment' | 'monthly_prorata' | 'per_hours_worked'; minutesPerYear: number; accrualRatePer10k: number; maxCarryOverMinutes: number; yearBasis: 'calendar' | 'anniversary' }`
  - `type LeaveBalanceView = { type: LeaveTypeView; availableMinutes: number; pendingMinutes: number; usedMinutesThisYear: number }`
  - `type LeaveRequestView = { id: string; workerId: string; workerName: string; typeId: string; typeName: string; startDay: string; endDay: string; minutesPerDay: number; minutes: number; status: 'submitted' | 'approved' | 'rejected' | 'cancelled'; reason: string | null; submittedAt: Date; decidedAt: Date | null; decidedBy: string | null; decisionReason: string | null }`
  - `listLeaveTypes(deps: Deps, ctx: SessionContext, includeArchived?: boolean): Promise<LeaveTypeView[]>`
  - `upsertLeaveType(deps: Deps, ctx: SessionContext, input: LeaveTypeInput): Promise<LeaveTypeView>`
  - `myLeave(deps: Deps, ctx: SessionContext): Promise<{ balances: LeaveBalanceView[]; requests: LeaveRequestView[] }>`
  - internal (not exported): `leaveBalancesFor(deps, workerId)`, `dayIsoOfMs(ms, tz)`, `windowBoundsMs(day, tz)`, `workerNameOf` helper.

- [ ] **Step 1: Write the failing tests — `tests/integration/leave.service.test.ts`**

Follow `tests/integration/*.test.ts` house style: import `{ afterAll, beforeAll, describe, expect, it }` from 'vitest', `{ asUser, db, deps, resetDb }` from './helpers', the service, and the schema tables the same way other integration tests import them (look at an existing one for the exact import path). Leave types are needed by every later test, so seed them in `beforeAll`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser, db, deps, resetDb } from './helpers'
import { leaveTypes } from '<same path other integration tests use for schema tables>'
import { listLeaveTypes, myLeave, upsertLeaveType } from '~/server/services/leave'

const baseType = {
  key: 'annual',
  name: 'Annual leave',
  paid: true,
  accrualMethod: 'monthly_prorata' as const,
  minutesPerYear: 9_600,
  accrualRatePer10k: 0,
  maxCarryOverMinutes: 2_400,
  yearBasis: 'calendar' as const,
}

beforeAll(async () => {
  await resetDb()
  await db.insert(leaveTypes).values({ id: 'lt-annual', ...baseType, createdAt: new Date(), updatedAt: new Date() })
})
afterAll(async () => { await resetDb() })

describe('listLeaveTypes', () => {
  it('any authenticated worker sees live types', async () => {
    const rows = await listLeaveTypes(deps(), asUser('operator'))
    expect(rows.map((t) => t.key)).toContain('annual')
  })
})

describe('upsertLeaveType', () => {
  it('admin can upsert by key', async () => {
    const t = await upsertLeaveType(deps(), asUser('admin'), { ...baseType, name: 'Annual leave (AU)' })
    expect(t.name).toBe('Annual leave (AU)')
    const again = await listLeaveTypes(deps(), asUser('operator'))
    expect(again.filter((x) => x.key === 'annual')).toHaveLength(1) // upsert, not duplicate
  })
  it('billing and operator are forbidden', async () => {
    await expect(upsertLeaveType(deps(), asUser('billing'), baseType)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
    await expect(upsertLeaveType(deps(), asUser('operator'), baseType)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })
})

describe('myLeave', () => {
  it('returns balances for every live type and my requests', async () => {
    const mine = await myLeave(deps(), asUser('operator'))
    expect(mine.balances.map((b) => b.type.key)).toEqual(['annual'])
    expect(mine.balances[0]!.availableMinutes).toBeGreaterThanOrEqual(0)
    expect(mine.requests).toEqual([])
  })
})
```

(If `asUser('operator')` / role strings differ in helpers — check `tests/integration/helpers.ts` and use its actual argument form; the seeded users are `admin@example.com`, `billing@example.com`, `ops@example.com`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/integration/leave.service.test.ts`
Expected: FAIL — cannot resolve `~/server/services/leave`.

- [ ] **Step 3: Implement `src/server/services/leave.ts` (part 1)**

State-machine comment at top (mirror the approvals service style):

```ts
// Leave requests: submitted → approved | rejected; submitted → cancelled by
// owner/admin. Decided rows are immutable (audit lives in leave_events).
// Balances are computed, never stored: policy + hire date + worked minutes −
// approved usage. Leave never blocks time entries (parallel model).

import { TZDate } from '@date-fns/tz'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { HttpError } from '~/lib/errors'
import { computeAvailableMinutes, requestMinutes, type LeavePolicy } from '~/lib/leaveMath'
import type { LeaveTypeInput } from '~/lib/schemas/leave'
import type { SessionContext } from '~/server/context'
import { hasRole } from '~/server/context'
import { assertCanEditWorker, assertCanViewWorker } from '~/server/guards/worker'
import type { Deps } from './deps'
// Import tables exactly as src/server/services/approvals.ts does, adding:
// intervals, leaveEvents, leaveRequests, leaveTypes (plus workers/humanWorkers
// and the user table it already joins for names). Import `sql` alongside
// eq/and/inArray/isNull/desc from 'drizzle-orm' (upsertLeaveType uses it).

export type LeaveTypeView = {
  id: string
  key: string
  name: string
  paid: boolean
  accrualMethod: 'annual_allotment' | 'monthly_prorata' | 'per_hours_worked'
  minutesPerYear: number
  accrualRatePer10k: number
  maxCarryOverMinutes: number
  yearBasis: 'calendar' | 'anniversary'
}

export type LeaveBalanceView = { type: LeaveTypeView; availableMinutes: number; pendingMinutes: number; usedMinutesThisYear: number }

export type LeaveRequestView = {
  id: string
  workerId: string
  workerName: string
  typeId: string
  typeName: string
  startDay: string
  endDay: string
  minutesPerDay: number
  minutes: number
  status: 'submitted' | 'approved' | 'rejected' | 'cancelled'
  reason: string | null
  submittedAt: Date
  decidedAt: Date | null
  decidedBy: string | null
  decisionReason: string | null
}

const asView = (t: typeof leaveTypes.$inferSelect): LeaveTypeView => ({
  id: t.id, key: t.key, name: t.name, paid: t.paid, accrualMethod: t.accrualMethod as LeaveTypeView['accrualMethod'],
  minutesPerYear: t.minutesPerYear, accrualRatePer10k: t.accrualRatePer10k,
  maxCarryOverMinutes: t.maxCarryOverMinutes, yearBasis: t.yearBasis as LeaveTypeView['yearBasis'],
})

const policyOf = (t: LeaveTypeView): LeavePolicy => ({
  key: t.key, accrualMethod: t.accrualMethod, minutesPerYear: t.minutesPerYear,
  accrualRatePer10k: t.accrualRatePer10k, maxCarryOverMinutes: t.maxCarryOverMinutes, yearBasis: t.yearBasis,
})

// org-tz day of an instant — TZDate local getters are tz-correct (#19/#22)
const dayIsoOfMs = (ms: number, tz: string) => {
  const d = new TZDate(ms, tz)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// [startMs, endMsExclusive) of an org-tz day
const windowBoundsMs = (day: string, tz: string) => {
  const d = new TZDate(`${day}T00:00:00`, tz)
  return [d.getTime(), d.getTime() + 86_400_000] as const
}

export async function listLeaveTypes(deps: Deps, _ctx: SessionContext, includeArchived = false): Promise<LeaveTypeView[]> {
  const rows = await deps.db.select().from(leaveTypes)
    .where(includeArchived ? undefined : isNull(leaveTypes.archivedAt))
    .orderBy(leaveTypes.key)
  return rows.map(asView)
}

export async function upsertLeaveType(deps: Deps, ctx: SessionContext, input: LeaveTypeInput): Promise<LeaveTypeView> {
  if (!hasRole(ctx, 'admin')) throw new HttpError(403, 'FORBIDDEN')
  const now = deps.now()
  const values = {
    id: input.id ?? crypto.randomUUID(),
    key: input.key, name: input.name, paid: input.paid,
    accrualMethod: input.accrualMethod, minutesPerYear: input.minutesPerYear,
    accrualRatePer10k: input.accrualRatePer10k, maxCarryOverMinutes: input.maxCarryOverMinutes,
    yearBasis: input.yearBasis, updatedAt: now,
  }
  const [row] = await deps.db.insert(leaveTypes).values(values)
    .onConflictDoUpdate({ target: leaveTypes.key, set: { ...values, id: sql`${leaveTypes.id}` } }) // keep the existing id on update
    .returning()
  return asView(row!)
}

// ---- balances -----------------------------------------------------------

// asOfDay lets leaveReport snapshot balances at a period end instead of now.
async function leaveBalancesFor(
  deps: Deps,
  ctx: SessionContext,
  workerId: string,
  asOfDay = dayIsoOfMs(deps.now().getTime(), deps.tz),
): Promise<LeaveBalanceView[]> {
  const types = await listLeaveTypes(deps, ctx)
  const [worker] = await deps.db.select().from(workers).where(eq(workers.id, workerId)).limit(1)
  if (!worker) throw new HttpError(404, 'NOT_FOUND', 'workerId')
  const hireDay = dayIsoOfMs(worker.createdAt.getTime(), deps.tz)

  const requests = await deps.db.select().from(leaveRequests)
    .where(and(eq(leaveRequests.workerId, workerId), inArray(leaveRequests.status, ['submitted', 'approved'])))

  const balances: LeaveBalanceView[] = []
  for (const t of types) {
    const policy = policyOf(t)
    // bucket approved usage + pending per accrual year (by startDay)
    const { accrualYears } = await import('~/lib/leaveMath')
    const years = accrualYears(policy, hireDay, asOfDay)
    const usedByYear = years.map(() => 0)
    let pendingMinutes = 0
    let usedMinutesThisYear = 0
    for (const r of requests) {
      if (r.typeId !== t.id) continue
      const mins = requestMinutes(r.startDay, r.endDay, r.minutesPerDay)
      if (r.status === 'submitted') { pendingMinutes += mins; continue }
      const i = years.findIndex((y, j) => r.startDay >= y.startDay && (j === years.length - 1 || r.startDay < years[j + 1]!.startDay))
      if (i >= 0) usedByYear[i]! += mins
    }

    // worked minutes per year, only when the policy needs them
    const workedByYear = years.map(() => 0)
    if (policy.accrualMethod === 'per_hours_worked' && years.length > 0) {
      const firstStart = windowBoundsMs(years[0]!.startDay, deps.tz)[0]
      const rows = await deps.db.select({ startedAt: intervals.startedAt, endedAt: intervals.endedAt })
        .from(intervals)
        .where(and(eq(intervals.workerId, workerId), isNull(intervals.deletedAt)))
      for (const row of rows) {
        years.forEach((y, i) => {
          const [ws, we] = windowBoundsMs(y.startDay, deps.tz)
          const nextStart = i === years.length - 1 ? Number.MAX_SAFE_INTEGER : windowBoundsMs(years[i + 1]!.startDay, deps.tz)[0]
          const lo = Math.max(row.startedAt.getTime(), ws)
          const hi = Math.min(row.endedAt.getTime(), we, nextStart)
          if (hi > lo) workedByYear[i]! += Math.round((hi - lo) / 60_000)
        })
      }
    }

    if (years.length > 0) {
      const i = years.length - 1
      usedMinutesThisYear = usedByYear[i]!
    }
    const available = years.length === 0 ? 0 : computeAvailableMinutes(policy, hireDay, asOfDay, usedByYear, workedByYear)
    balances.push({ type: t, availableMinutes: available, pendingMinutes, usedMinutesThisYear })
  }
  return balances
}

export async function myLeave(deps: Deps, ctx: SessionContext): Promise<{ balances: LeaveBalanceView[]; requests: LeaveRequestView[] }> {
  if (!ctx.workerId) throw new HttpError(403, 'FORBIDDEN')
  const balances = await leaveBalancesFor(deps, ctx, ctx.workerId)
  const requests = await requestViewsFor(deps, ctx.workerId)
  return { balances, requests }
}

// shared view builder — B2 extends this file with the lifecycle functions
async function requestViewsFor(deps: Deps, workerId: string): Promise<LeaveRequestView[]> {
  const rows = await deps.db.select().from(leaveRequests)
    .where(eq(leaveRequests.workerId, workerId))
    .orderBy(desc(leaveRequests.submittedAt))
  return rows.map((r) => ({ ...toViewShell(r), workerName: '', typeName: '' }))
}

function toViewShell(r: typeof leaveRequests.$inferSelect): Omit<LeaveRequestView, 'workerName' | 'typeName'> {
  return {
    id: r.id, workerId: r.workerId, typeId: r.typeId,
    startDay: r.startDay, endDay: r.endDay, minutesPerDay: r.minutesPerDay,
    minutes: requestMinutes(r.startDay, r.endDay, r.minutesPerDay),
    status: r.status as LeaveRequestView['status'], reason: r.reason,
    submittedAt: r.submittedAt, decidedAt: r.decidedAt, decidedBy: r.decidedBy, decisionReason: r.decisionReason,
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/integration/leave.service.test.ts`
Expected: PASS (upsert/list/myLeave green).

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → exit 0.

```bash
git add src/server/services/leave.ts tests/integration/leave.service.test.ts
git commit -m "feat: leave types and balances service"
```

### Task B2: leave request lifecycle + moderation + report

**Files:**
- Modify: `src/server/services/leave.ts` (append the lifecycle section)
- Test: `tests/integration/leave.service.test.ts` (append the lifecycle cases)

**Interfaces:**
- Consumes: `leaveBalancesFor(deps, ctx, workerId, asOfDay?)`, `toViewShell`, `requestViewsFor`, `LeaveTypeView`/`LeaveRequestView`/`LeaveBalanceView` from B1; `LeaveRequestInput`/`ApproveLeaveInput`/`RejectLeaveInput`/`CancelLeaveInput` from A2; `requestMinutes` from A3.
- Produces (B3 fns wrap all of these; C1–C4 consume the views):
  - `submitLeaveRequest(deps, ctx, input: LeaveRequestInput): Promise<LeaveRequestView>`
  - `cancelLeaveRequest(deps, ctx, input: CancelLeaveInput): Promise<LeaveRequestView>`
  - `approveLeaveRequest(deps, ctx, input: ApproveLeaveInput): Promise<LeaveRequestView>`
  - `rejectLeaveRequest(deps, ctx, input: RejectLeaveInput): Promise<LeaveRequestView>`
  - `leaveQueue(deps, ctx): Promise<LeaveRequestView[]>` (billing/admin)
  - `leaveReport(deps, ctx, input: { from: string; to: string }): Promise<LeaveReportView[]>` where
    `LeaveReportView = { workerId: string; workerName: string; typeId: string; typeName: string; takenMinutes: number; requests: number; pendingMinutes: number; balanceMinutes: number }`

- [ ] **Step 1: Write the failing tests (append to tests/integration/leave.service.test.ts)**

```ts
describe('leave lifecycle', () => {
  const submit = (ctx: SessionContext, typeId: string, startDay: string, endDay: string, extra: Partial<LeaveRequestInput> = {}) =>
    submitLeaveRequest(deps(), ctx, { typeId, startDay, endDay, minutesPerDay: 480, ...extra })

  it('submits two days as 960 minutes and records a submit event', async () => {
    const ctx = asUser('operator')
    const v = await submit(ctx, 'lt-annual', '2026-10-05', '2026-10-06')
    expect(v.minutes).toBe(960)
    expect(v.status).toBe('submitted')
    const events = await db().select().from(leaveEvents).where(eq(leaveEvents.requestId, v.id))
    expect(events.map((e) => e.kind)).toEqual(['submit'])
  })

  it('re-checks END_BEFORE_START at the service layer', async () => {
    await expect(submit(asUser('operator'), 'lt-annual', '2026-10-07', '2026-10-06')).rejects.toMatchObject({ status: 400, code: 'END_BEFORE_START' })
  })

  it('rejects overlapping leave of any type with LEAVE_OVERLAP', async () => {
    await submit(asUser('operator'), 'lt-annual', '2026-10-05', '2026-10-06')
    const err = await submit(asUser('operator'), 'lt-sick', '2026-10-06', '2026-10-08').catch((e: unknown) => e)
    expect(err).toMatchObject({ status: 409, code: 'LEAVE_OVERLAP' })
    expect((err as HttpError).data).toHaveProperty('conflictingId')
  })

  it('blocks requests beyond the accrued balance (fresh worker, monthly prorata)', async () => {
    // opWorker was created at seed time (at(0)); by the test "now" only a sliver
    // of the annual allowance has accrued — 20 days cannot fit.
    const err = await submit(asUser('operator'), 'lt-annual', '2026-10-05', '2026-10-30').catch((e: unknown) => e)
    expect(err).toMatchObject({ status: 409, code: 'LEAVE_INSUFFICIENT_BALANCE', field: 'typeId' })
    expect((err as HttpError).data).toHaveProperty('availableMinutes')
  })

  it('never balance-checks unpaid leave (no accrual)', async () => {
    const v = await submit(asUser('operator'), 'lt-unpaid', '2026-10-05', '2026-10-09')
    expect(v.minutes).toBe(5 * 480)
  })

  it('404s an unknown type with LEAVE_TYPE_NOT_FOUND', async () => {
    await expect(submit(asUser('operator'), 'lt-nope', '2026-10-05', '2026-10-06')).rejects.toMatchObject({ status: 404, code: 'LEAVE_TYPE_NOT_FOUND', field: 'typeId' })
  })

  it('forbids submitting for another worker (FORBIDDEN_TARGET)', async () => {
    const other = (await db().select().from(workers).where(eq(workers.kind, 'human'))).find((w) => w.id !== ids.opWorker)!.id
    await expect(submit(asUser('operator'), 'lt-annual', '2026-10-05', '2026-10-06', { workerId: other })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN_TARGET' })
  })

  it('approves as billing, records the event, and sets decision fields', async () => {
    const op = asUser('operator')
    const v = await submit(op, 'lt-annual', '2026-10-05', '2026-10-06')
    const approved = await approveLeaveRequest(deps(), asUser('billing'), { id: v.id, comment: 'Enjoy' })
    expect(approved.status).toBe('approved')
    expect(approved.decisionReason).toBe('Enjoy')
    const events = await db().select().from(leaveEvents).where(eq(leaveEvents.requestId, v.id))
    expect(events.map((e) => e.kind)).toEqual(['submit', 'approve'])
  })

  it('SELF_APPROVAL when billing approves their own request; admin override works', async () => {
    const own = await submitLeaveRequest(deps(), asUser('billing'), { typeId: 'lt-annual', startDay: '2026-10-05', endDay: '2026-10-06', minutesPerDay: 480 })
    await expect(approveLeaveRequest(deps(), asUser('billing'), { id: own.id })).rejects.toMatchObject({ status: 409, code: 'SELF_APPROVAL' })
    expect((await approveLeaveRequest(deps(), asUser('admin'), { id: own.id })).status).toBe('approved')
  })

  it('operators cannot moderate (FORBIDDEN)', async () => {
    const v = await submit(asUser('operator'), 'lt-annual', '2026-10-05', '2026-10-06')
    await expect(approveLeaveRequest(deps(), asUser('operator'), { id: v.id })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })

  it('double-approve is INVALID_TRANSITION', async () => {
    const v = await submit(asUser('operator'), 'lt-annual', '2026-10-05', '2026-10-06')
    await approveLeaveRequest(deps(), asUser('billing'), { id: v.id })
    await expect(approveLeaveRequest(deps(), asUser('billing'), { id: v.id })).rejects.toMatchObject({ status: 409, code: 'INVALID_TRANSITION' })
  })

  it('rejects with a reason', async () => {
    const v = await submit(asUser('operator'), 'lt-annual', '2026-10-05', '2026-10-06')
    const r = await rejectLeaveRequest(deps(), asUser('billing'), { id: v.id, reason: 'Not enough balance' })
    expect(r.status).toBe('rejected')
    expect(r.decisionReason).toBe('Not enough balance')
  })

  it('cancels own submitted request; cancelling after approval is INVALID_TRANSITION', async () => {
    const op = asUser('operator')
    const a = await submit(op, 'lt-annual', '2026-11-02', '2026-11-03')
    expect((await cancelLeaveRequest(deps(), op, { id: a.id })).status).toBe('cancelled')
    const b = await submit(op, 'lt-annual', '2026-11-04', '2026-11-05')
    await approveLeaveRequest(deps(), asUser('billing'), { id: b.id })
    await expect(cancelLeaveRequest(deps(), op, { id: b.id })).rejects.toMatchObject({ status: 409, code: 'INVALID_TRANSITION' })
  })

  it('only the owner or an admin can cancel (FORBIDDEN_TARGET)', async () => {
    const v = await submit(asUser('operator'), 'lt-annual', '2026-11-02', '2026-11-03')
    await expect(cancelLeaveRequest(deps(), asUser('billing'), { id: v.id })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN_TARGET' })
  })

  it('leaveQueue lists submitted oldest-first for billing only', async () => {
    const queue = await leaveQueue(deps(), asUser('billing'))
    expect(queue.every((r) => r.status === 'submitted')).toBe(true)
    await expect(leaveQueue(deps(), asUser('operator'))).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })

  it('leaveReport counts only approved usage inside the period and snapshots balances at "to"', async () => {
    const op = asUser('operator')
    const inPeriod = await submit(op, 'lt-sick', '2026-09-14', '2026-09-15')
    await approveLeaveRequest(deps(), asUser('billing'), { id: inPeriod.id })
    await submit(op, 'lt-annual', '2026-12-14', '2026-12-15') // approved-period? no: outside [from,to] window usage
    const rows = await leaveReport(deps(), asUser('billing'), { from: '2026-09-01', to: '2026-09-30' })
    const sick = rows.find((r) => r.typeId === 'lt-sick')!
    expect(sick.takenMinutes).toBe(2 * 480)
    expect(sick.requests).toBe(1)
    expect(Number.isInteger(sick.balanceMinutes)).toBe(true)
  })
})
```

Add to the test file's imports: `submitLeaveRequest, cancelLeaveRequest, approveLeaveRequest, rejectLeaveRequest, leaveQueue, leaveReport` from `~/server/services/leave`, `leaveEvents` from `~/server/db/schema` (or wherever the existing tests import tables from — mirror an existing integration test's import), `HttpError` from `~/lib/errors`, and the `LeaveRequestInput` type.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/integration/leave.service.test.ts`
Expected: FAIL — `submitLeaveRequest is not a function` (module has no export).

- [ ] **Step 3: Implement the lifecycle (append to src/server/services/leave.ts)**

```ts
// ---- lifecycle ----------------------------------------------------------

const leaveEventRow = (requestId: string, kind: string, actorWorkerId: string, reason: string | null, at: Date) => ({
  id: crypto.randomUUID(), requestId, kind, actorWorkerId, reason, at,
})

async function requestViewById(deps: Deps, id: string): Promise<LeaveRequestView | null> {
  const [r] = await deps.db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1)
  if (!r) return null
  const [t] = await deps.db.select({ name: leaveTypes.name }).from(leaveTypes).where(eq(leaveTypes.id, r.typeId)).limit(1)
  const workerName = await workerDisplayName(deps, r.workerId)
  return { ...toViewShell(r), typeName: t?.name ?? '?', workerName }
}

// mirrors approvals.ts workerNames(): humanWorkers -> user name, else worker name
async function workerDisplayName(deps: Deps, workerId: string): Promise<string> {
  const [row] = await deps.db
    .select({ userName: user.name, workerName: workers.name })
    .from(workers)
    .leftJoin(humanWorkers, eq(humanWorkers.workerId, workers.id))
    .leftJoin(user, eq(user.id, humanWorkers.userId))
    .where(eq(workers.id, workerId))
    .limit(1)
  return row?.userName ?? row?.workerName ?? '?'
}

export async function submitLeaveRequest(deps: Deps, ctx: SessionContext, input: LeaveRequestInput): Promise<LeaveRequestView> {
  const workerId = input.workerId ?? ctx.workerId
  if (!workerId) throw new HttpError(403, 'FORBIDDEN')
  await assertCanEditWorker(deps, ctx, workerId)
  const [type] = await deps.db.select().from(leaveTypes)
    .where(and(eq(leaveTypes.id, input.typeId), isNull(leaveTypes.archivedAt))).limit(1)
  if (!type) throw new HttpError(404, 'LEAVE_TYPE_NOT_FOUND', 'typeId')
  // zod refines this; services re-check for direct callers (#25, like approvals NOT_A_MONDAY)
  if (input.endDay < input.startDay) throw new HttpError(400, 'END_BEFORE_START', 'endDay')

  // inclusive-day overlap against this worker's submitted/approved leave, any type
  const own = await deps.db.select({ id: leaveRequests.id, startDay: leaveRequests.startDay, endDay: leaveRequests.endDay })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.workerId, workerId), inArray(leaveRequests.status, ['submitted', 'approved'])))
  const conflict = own.find((r) => !(r.endDay < input.startDay || r.startDay > input.endDay))
  if (conflict) throw new HttpError(409, 'LEAVE_OVERLAP', 'endDay', { conflictingId: conflict.id })

  // balance gate only when the policy actually grants something
  const minutes = requestMinutes(input.startDay, input.endDay, input.minutesPerDay)
  if (type.minutesPerYear > 0 || type.accrualRatePer10k > 0) {
    const balances = await leaveBalancesFor(deps, ctx, workerId)
    const b = balances.find((x) => x.type.id === type.id)
    const available = b?.availableMinutes ?? 0
    if (available - (b?.pendingMinutes ?? 0) - minutes < 0) {
      throw new HttpError(409, 'LEAVE_INSUFFICIENT_BALANCE', 'typeId', { availableMinutes: available })
    }
  }

  const now = deps.now()
  const id = crypto.randomUUID()
  await deps.db.insert(leaveRequests).values({
    id, workerId, typeId: type.id, startDay: input.startDay, endDay: input.endDay,
    minutesPerDay: input.minutesPerDay, status: 'submitted', reason: input.reason ?? null,
    submittedAt: now, submittedBy: ctx.workerId!,
  })
  await deps.db.insert(leaveEvents).values(leaveEventRow(id, 'submit', ctx.workerId!, input.reason ?? null, now))
  return (await requestViewById(deps, id))!
}

export async function cancelLeaveRequest(deps: Deps, ctx: SessionContext, input: CancelLeaveInput): Promise<LeaveRequestView> {
  const [r] = await deps.db.select().from(leaveRequests).where(eq(leaveRequests.id, input.id)).limit(1)
  if (!r) throw new HttpError(404, 'LEAVE_NOT_FOUND', 'id')
  // cancel is owner-or-admin, narrower than assertCanEditWorker (no supervisor cancel)
  if (r.workerId !== ctx.workerId && !hasRole(ctx, 'admin')) throw new HttpError(403, 'FORBIDDEN_TARGET', 'workerId')
  const now = deps.now()
  const rows = await deps.db.update(leaveRequests)
    .set({ status: 'cancelled', decidedAt: now, decidedBy: ctx.workerId! })
    .where(and(eq(leaveRequests.id, input.id), eq(leaveRequests.status, 'submitted')))
    .returning({ id: leaveRequests.id })
  if (rows.length === 0) throw new HttpError(409, 'INVALID_TRANSITION') // approvals-style optimistic guard
  await deps.db.insert(leaveEvents).values(leaveEventRow(input.id, 'cancel', ctx.workerId!, null, now))
  return (await requestViewById(deps, input.id))!
}

const assertModerator = (ctx: SessionContext) => {
  if (!hasRole(ctx, 'billing') && !hasRole(ctx, 'admin')) throw new HttpError(403, 'FORBIDDEN')
}

const assertNotOwnRequest = (ctx: SessionContext, workerId: string) => {
  if (ctx.workerId === workerId && !hasRole(ctx, 'admin')) throw new HttpError(409, 'SELF_APPROVAL')
}

export async function approveLeaveRequest(deps: Deps, ctx: SessionContext, input: ApproveLeaveInput): Promise<LeaveRequestView> {
  assertModerator(ctx)
  const [r] = await deps.db.select().from(leaveRequests).where(eq(leaveRequests.id, input.id)).limit(1)
  if (!r) throw new HttpError(404, 'LEAVE_NOT_FOUND', 'id')
  assertNotOwnRequest(ctx, r.workerId)
  // re-check the balance at decision time — another request may have been approved since submit
  const [type] = await deps.db.select().from(leaveTypes).where(eq(leaveTypes.id, r.typeId)).limit(1)
  const minutes = requestMinutes(r.startDay, r.endDay, r.minutesPerDay)
  if (type && (type.minutesPerYear > 0 || type.accrualRatePer10k > 0)) {
    const balances = await leaveBalancesFor(deps, ctx, r.workerId)
    const b = balances.find((x) => x.type.id === r.typeId)
    if ((b?.availableMinutes ?? 0) - minutes < 0) throw new HttpError(409, 'LEAVE_INSUFFICIENT_BALANCE', 'typeId', { availableMinutes: b?.availableMinutes ?? 0 })
  }
  const now = deps.now()
  const rows = await deps.db.update(leaveRequests)
    .set({ status: 'approved', decidedAt: now, decidedBy: ctx.workerId!, decisionReason: input.comment ?? null })
    .where(and(eq(leaveRequests.id, input.id), eq(leaveRequests.status, 'submitted')))
    .returning({ id: leaveRequests.id })
  if (rows.length === 0) throw new HttpError(409, 'INVALID_TRANSITION')
  await deps.db.insert(leaveEvents).values(leaveEventRow(input.id, 'approve', ctx.workerId!, input.comment ?? null, now))
  return (await requestViewById(deps, input.id))!
}

export async function rejectLeaveRequest(deps: Deps, ctx: SessionContext, input: RejectLeaveInput): Promise<LeaveRequestView> {
  assertModerator(ctx)
  const [r] = await deps.db.select().from(leaveRequests).where(eq(leaveRequests.id, input.id)).limit(1)
  if (!r) throw new HttpError(404, 'LEAVE_NOT_FOUND', 'id')
  assertNotOwnRequest(ctx, r.workerId)
  const now = deps.now()
  const rows = await deps.db.update(leaveRequests)
    .set({ status: 'rejected', decidedAt: now, decidedBy: ctx.workerId!, decisionReason: input.reason })
    .where(and(eq(leaveRequests.id, input.id), eq(leaveRequests.status, 'submitted')))
    .returning({ id: leaveRequests.id })
  if (rows.length === 0) throw new HttpError(409, 'INVALID_TRANSITION')
  await deps.db.insert(leaveEvents).values(leaveEventRow(input.id, 'reject', ctx.workerId!, input.reason, now))
  return (await requestViewById(deps, input.id))!
}

export async function leaveQueue(deps: Deps, ctx: SessionContext): Promise<LeaveRequestView[]> {
  assertModerator(ctx)
  const rows = await deps.db.select().from(leaveRequests)
    .where(eq(leaveRequests.status, 'submitted'))
    .orderBy(asc(leaveRequests.submittedAt))
  const views: LeaveRequestView[] = []
  for (const r of rows) views.push((await requestViewById(deps, r.id))!)
  return views
}

export type LeaveReportView = {
  workerId: string; workerName: string; typeId: string; typeName: string
  takenMinutes: number; requests: number; pendingMinutes: number; balanceMinutes: number
}

export async function leaveReport(deps: Deps, ctx: SessionContext, input: { from: string; to: string }): Promise<LeaveReportView[]> {
  assertModerator(ctx)
  const all = await deps.db.select().from(leaveRequests)
    .where(and(gte(leaveRequests.startDay, input.from), lte(leaveRequests.startDay, input.to)))
  const groups = new Map<string, { workerId: string; workerName: string; typeId: string; typeName: string; takenMinutes: number; requests: number; pendingMinutes: number }>()
  for (const r of all) {
    if (r.status !== 'approved' && r.status !== 'submitted') continue
    const key = `${r.workerId}|${r.typeId}`
    const name = await workerDisplayName(deps, r.workerId)
    const [t] = await deps.db.select({ name: leaveTypes.name }).from(leaveTypes).where(eq(leaveTypes.id, r.typeId)).limit(1)
    const g = groups.get(key) ?? { workerId: r.workerId, workerName: name, typeId: r.typeId, typeName: t?.name ?? '?', takenMinutes: 0, requests: 0, pendingMinutes: 0 }
    const mins = requestMinutes(r.startDay, r.endDay, r.minutesPerDay)
    if (r.status === 'approved') { g.takenMinutes += mins; g.requests += 1 } else { g.pendingMinutes += mins }
    groups.set(key, g)
  }
  const out: LeaveReportView[] = []
  for (const g of groups.values()) {
    // balance snapshot at the period end, not "now" — reports describe the period
    const balances = await leaveBalancesFor(deps, ctx, g.workerId, input.to)
    const b = balances.find((x) => x.type.id === g.typeId)
    out.push({ ...g, balanceMinutes: b?.availableMinutes ?? 0 })
  }
  return out
}
```

Notes for the implementer:
- `asc`, `gte`, `lte` need adding to the drizzle-orm import list.
- `user`/`humanWorkers` come from the schema import block (approvals.ts already joins them for `workerNames` — copy that import).
- `leaveReport` groups only workers who have requests in the period; a worker with leave but no requests in-window doesn't appear (correct for a period report).

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/integration/leave.service.test.ts`
Expected: PASS — every lifecycle case green.

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → exit 0.

```bash
git add src/server/services/leave.ts tests/integration/leave.service.test.ts
git commit -m "feat: leave request lifecycle"
```

---

### Task B3: Server fns

**Files:**
- Create: `src/server/fns/leave.ts`

**Interfaces:**
- Consumes: every service export from Task B2 (`listLeaveTypes`, `upsertLeaveType`, `myLeave`, `submitLeaveRequest`, `cancelLeaveRequest`, `approveLeaveRequest`, `rejectLeaveRequest`, `leaveQueue`, `leaveReport`), schemas from `src/lib/schemas/leave.ts`, `PeriodInput` from `src/lib/schemas/reports.ts`.
- Produces: `listLeaveTypesFn`, `upsertLeaveTypeFn`, `myLeaveFn`, `submitLeaveRequestFn`, `cancelLeaveRequestFn`, `approveLeaveRequestFn`, `rejectLeaveRequestFn`, `leaveQueueFn`, `leaveReportFn` — consumed by Wave C routes.

- [ ] **Step 1: Write the fn file**

Thin wrappers mirroring `src/server/fns/approvals.ts` exactly (imports, chain shape, type re-exports). GET fns may carry validators — the approvals file's `listMyWeeksFn` (GET + `.validator(ListMyWeeksInput)`) is the precedent.

```ts
export const listLeaveTypesFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .handler(({ context }) => svc.listLeaveTypes(runtimeDeps(), ctxOf(context)))

export const upsertLeaveTypeFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(LeaveTypeInput)
  .handler(({ data, context }) => svc.upsertLeaveType(runtimeDeps(), ctxOf(context), data))

export const myLeaveFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .handler(({ context }) => svc.myLeave(runtimeDeps(), ctxOf(context)))

export const submitLeaveRequestFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(LeaveRequestInput)
  .handler(({ data, context }) => svc.submitLeaveRequest(runtimeDeps(), ctxOf(context), data))

export const cancelLeaveRequestFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(CancelLeaveInput)
  .handler(({ data, context }) => svc.cancelLeaveRequest(runtimeDeps(), ctxOf(context), data))

export const approveLeaveRequestFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(ApproveLeaveInput)
  .handler(({ data, context }) => svc.approveLeaveRequest(runtimeDeps(), ctxOf(context), data))

export const rejectLeaveRequestFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(RejectLeaveInput)
  .handler(({ data, context }) => svc.rejectLeaveRequest(runtimeDeps(), ctxOf(context), data))

export const leaveQueueFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .handler(({ context }) => svc.leaveQueue(runtimeDeps(), ctxOf(context)))

export const leaveReportFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(PeriodInput)
  .handler(({ data, context }) => svc.leaveReport(runtimeDeps(), ctxOf(context), data))

export type {
  LeaveBalanceView,
  LeaveReportView,
  LeaveRequestView,
  LeaveTypeView,
} from '~/server/services/leave'
```

- [ ] **Step 2: Gate + commit**

Run: `npm run check` → exit 0 (fns are thin; tsc is their test).

```bash
git add src/server/fns/leave.ts
git commit -m "feat: leave server fns"
```

---

## Wave C — screens

### Task C1: Operator leave page

**Files:**
- Modify: `src/routes/_app/route.tsx` (nav link)
- Create: `src/routes/_app/leave.tsx`
- Modify: `src/styles/global.css` (append `.leave*` block at end)
- Modify (generated churn, commit with this task): `src/routeTree.gen.ts`

**Interfaces:**
- Consumes: `myLeaveFn`, `submitLeaveRequestFn`, `cancelLeaveRequestFn`, `listLeaveTypesFn` from B3; `LeaveBalanceView`/`LeaveRequestView`/`LeaveTypeView` types; `Button`, `StatusChip`, `applyServerError`, `formatHmm` from `~/lib/money`; `CalendarDays` icon from `reicon-react`.
- Produces: `/leave` route (operator-facing). `leaveBadgeKind` map local to this file.

- [ ] **Step 1: Add the nav link**

In `src/routes/_app/route.tsx`, after the Approvals link and before the admin-guarded link:

```tsx
        <Link to="/leave" activeProps={{ className: 'active' }}>
          <CalendarDays size={15} /> Leave
        </Link>
```

Add `CalendarDays` to the existing `reicon-react` import.

- [ ] **Step 2: Write the route**

```tsx
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { CalendarDays } from 'reicon-react'
import { Button } from '~/components/ui/button'
import { StatusChip } from '~/components/ui/chip'
import { applyServerError } from '~/components/forms/applyServerError'
import { formatHmm } from '~/lib/money'
import { cancelLeaveRequestFn, listLeaveTypesFn, myLeaveFn, submitLeaveRequestFn } from '~/server/fns/leave'
import type { LeaveBalanceView, LeaveRequestView } from '~/server/fns/leave'

const leaveBadgeKind = {
  submitted: 'inverse',
  approved: 'solid',
  rejected: 'error',
  cancelled: 'muted',
} as const

const STATUS_TEXT: Record<LeaveRequestView['status'], string> = {
  submitted: 'Waiting on approval',
  approved: 'Approved',
  rejected: 'Declined',
  cancelled: 'Cancelled',
}

// hours-per-day is operator input, converted to whole minutes before submit
const FormHours = z.number().min(0.25).max(24)

export const Route = createFileRoute('/_app/leave')({
  loader: async () => {
    const [mine, types] = await Promise.all([myLeaveFn(), listLeaveTypesFn()])
    return {
      balances: mine.balances,
      requests: mine.requests,
      types: types.map((t) => ({ id: t.id, name: t.name })),
    }
  },
  component: LeavePage,
})

function LeavePage() {
  const router = useRouter()
  const { balances, requests, types } = Route.useLoaderData() as {
    balances: LeaveBalanceView[]
    requests: LeaveRequestView[]
    types: { id: string; name: string }[]
  }

  const form = useForm({
    defaultValues: { typeId: '', startDay: '', endDay: '', hoursPerDay: 8, reason: '' },
    validators: {
      onSubmit: z.object({
        typeId: z.string().min(1, 'Pick a type'),
        startDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a start day'),
        endDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick an end day'),
        hoursPerDay: FormHours,
        reason: z.string().max(500),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await submitLeaveRequestFn({
          data: {
            typeId: value.typeId,
            startDay: value.startDay,
            endDay: value.endDay,
            minutesPerDay: Math.round(value.hoursPerDay * 60),
            reason: value.reason || undefined,
          },
        })
        form.reset()
        await router.invalidate()
      } catch (e) {
        applyServerError(form, e)
      }
    },
  })

  return (
    <main className="leave">
      <h1><CalendarDays size={18} /> Leave</h1>

      <section className="leave-balances">
        {balances.map((b) => (
          <div key={b.type.id} className="leave-balance">
            <div className="k">{b.type.name}</div>
            <div className="v">{formatHmm(b.availableMinutes)} available</div>
            <div className="hint">{formatHmm(b.pendingMinutes)} pending</div>
          </div>
        ))}
        {balances.length === 0 && <p className="tree-empty">No leave types yet.</p>}
      </section>

      <form
        className="entryform"
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <div className="entryform-row">
          <form.Field name="typeId">
            {(field) => (
              <label className="field">
                <span>Type</span>
                <select
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                >
                  <option value="">Pick a type…</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
            )}
          </form.Field>
          <form.Field name="hoursPerDay">
            {(field) => (
              <label className="field">
                <span>Hours per day</span>
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="24"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(Number(e.target.value))}
                />
              </label>
            )}
          </form.Field>
        </div>
        <div className="entryform-row">
          <form.Field name="startDay">
            {(field) => (
              <label className="field">
                <span>First day</span>
                <input
                  type="date"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </label>
            )}
          </form.Field>
          <form.Field name="endDay">
            {(field) => (
              <label className="field">
                <span>Last day</span>
                <input
                  type="date"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </label>
            )}
          </form.Field>
        </div>
        <form.Field name="reason">
          {(field) => (
            <label className="field">
              <span>Reason (optional)</span>
              <textarea
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                maxLength={500}
              />
            </label>
          )}
        </form.Field>
        <div className="entryform-actions">
          <Button type="submit" variant="primary">Request leave</Button>
        </div>
      </form>

      {requests.length > 0 && (
        <table className="intervallist">
          <thead>
            <tr>
              <th>Type</th>
              <th>Days</th>
              <th>Hours</th>
              <th>Status</th>
              <th>Reason</th>
              <th>Decision</th>
              <th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{r.typeName}</td>
                <td className="mono">{r.days}</td>
                <td className="mono">{formatHmm(r.minutes)}</td>
                <td><StatusChip kind={leaveBadgeKind[r.status]}>{STATUS_TEXT[r.status]}</StatusChip></td>
                <td>{r.reason ?? ''}</td>
                <td>{r.decisionReason ?? ''}</td>
                <td className="intervallist-actions">
                  {r.status === 'submitted' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await cancelLeaveRequestFn({ data: { id: r.id } })
                        await router.invalidate()
                      }}
                    >
                      Cancel request
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {requests.length === 0 && <p className="tree-empty">No leave requests yet.</p>}
    </main>
  )
}
```

Notes:
- Data loading uses the sibling-route pattern (`loader` + `Route.useLoaderData()` + `router.invalidate()` after mutations — see `_app/approvals.tsx` / `_app/admin/workers.tsx`).
- `LeaveRequestView` must expose `days`, `minutes`, `typeName`, `reason`, `decisionReason`, `status` — it does, per Task B1/B2's view shape.
- New copy introduced by this screen (frozen once landed): `Leave`, `available`, `pending`, `No leave types yet.`, `Pick a type…`, `Type`, `Hours per day`, `First day`, `Last day`, `Reason (optional)`, `Request leave`, `Days`, `Hours`, `Status`, `Decision`, `Cancel request`, `No leave requests yet.`, `Waiting on approval`, `Approved`, `Declined`, `Cancelled`.

- [ ] **Step 3: Append the CSS block**

At the end of `src/styles/global.css`:

```css
/* ---------- leave ---------- */
.leave {
  display: grid;
  gap: var(--space-5);
  padding: var(--space-5) var(--space-4);
  max-width: 1100px;
}
.leave h1 {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
}
.leave-balances {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-2);
}
.leave-balance {
  background: var(--surface-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-1);
  padding: var(--space-3) var(--space-4);
  display: grid;
  gap: var(--space-1);
}
.leave-balance .k {
  font: 500 14px/1.3 var(--font-body);
  color: var(--color-muted);
}
.leave-balance .v {
  font: 600 20px/1.3 var(--font-body);
  color: var(--color-primary);
  font-variant-numeric: tabular-nums;
}
.leave-balance .hint {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-muted);
}
```

- [ ] **Step 4: Gate, eyeball, commit**

Run: `npm run dev -- --port 3123 --strictPort`; eyeball `/leave` as `ops@example.com`: balance cards, form, empty-state copy, badge colors.
Run: `npm run check` → exit 0. Commit (routeTree churn rides along):

```bash
git add src/routes/_app/route.tsx src/routes/_app/leave.tsx src/styles/global.css src/routeTree.gen.ts
git commit -m "feat: leave page"
```

---

### Task C2: Moderation queue on `/leave`

**Files:**
- Modify: `src/routes/_app/leave.tsx`
- Modify: `src/styles/global.css` (append `.leavequeue*` rules)

**Interfaces:**
- Consumes: `leaveQueueFn`, `approveLeaveRequestFn`, `rejectLeaveRequestFn` from B3; `getSessionCtxFn` + `hasRole` (`~/server/context`); `LeaveReportView` not needed here.
- Produces: moderation section visible only to billing/admin on `/leave`.

- [ ] **Step 1: Extend the loader**

Add to the existing `loader` in `src/routes/_app/leave.tsx` (queue loads only for billing/admin):

```tsx
  loader: async () => {
    const [mine, types] = await Promise.all([myLeaveFn(), listLeaveTypesFn()])
    const ctx = await getSessionCtxFn()
    const canModerate = !!ctx && (hasRole(ctx, 'billing') || hasRole(ctx, 'admin'))
    const queue = canModerate ? await leaveQueueFn() : []
    return {
      balances: mine.balances,
      requests: mine.requests,
      types: types.map((t) => ({ id: t.id, name: t.name })),
      canModerate,
      queue,
    }
  },
```

New imports: `getSessionCtxFn` from `~/server/fns/auth`, `hasRole` from `~/server/context`, `approveLeaveRequestFn`, `leaveQueueFn`, `rejectLeaveRequestFn` from `~/server/fns/leave`, `type LeaveRequestView` already imported.

- [ ] **Step 2: Render the queue section**

Inside `<main className="leave">`, after the balances section and before the request form (moderators see the queue first):

```tsx
      {canModerate && (
        <section className="leavequeue">
          <h2 className="today-section-title">
            Waiting on you {queue.length > 0 && <span className="leavequeue-count">{queue.length}</span>}
          </h2>
          {queue.length === 0 && <p className="tree-empty">Nothing waiting on you.</p>}
          {queue.map((r) => (
            <div key={r.id} className="leavequeue-row">
              <div className="leavequeue-main">
                <span className="leavequeue-who">{r.workerName}</span>
                <span className="leavequeue-what">
                  {r.typeName} · {r.days} {r.days === 1 ? 'day' : 'days'} · {formatHmm(r.minutes)}
                </span>
                <span className="leavequeue-days">{r.startDay} → {r.endDay}</span>
                {r.reason && <span className="leavequeue-reason">{r.reason}</span>}
              </div>
              <ApproveReject requestId={r.id} onDone={() => void router.invalidate()} />
            </div>
          ))}
        </section>
      )}
```

And a small local component at the bottom of the file (two inline forms — reject needs a reason):

```tsx
function ApproveReject({ requestId, onDone }: { requestId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  return (
    <div className="leavequeue-actions">
      <Button
        type="button"
        variant="primary"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError('')
          try {
            await approveLeaveRequestFn({ data: { id: requestId } })
            onDone()
          } catch (e) {
            setError(serverErrorMessage(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        <Check size={13} /> Approve
      </Button>
      <form
        className="leavequeue-reject"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!reason.trim()) {
            setError('A reason is required to decline.')
            return
          }
          setBusy(true)
          setError('')
          try {
            await rejectLeaveRequestFn({ data: { id: requestId, reason: reason.trim() } })
            setReason('')
            onDone()
          } catch (e) {
            setError(serverErrorMessage(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason"
          maxLength={500}
          aria-label="Reason to decline"
        />
        <Button type="submit" variant="destructive" size="sm" disabled={busy}>
          <X size={13} /> Decline
        </Button>
      </form>
      {error && <span className="field-error" role="alert">{error}</span>}
    </div>
  )
}
```

New imports for the file: `useState` from `react`, `Check`, `X` from `reicon-react`, `serverErrorMessage` from `~/components/forms/applyServerError`. New copy (frozen once landed): `Waiting on you`, `Nothing waiting on you.`, `Approve`, `Decline`, `Reason`, `A reason is required to decline.`, `day`/`days` (pluralization pair).

- [ ] **Step 3: Append the CSS**

```css
.leavequeue { display: grid; gap: var(--space-2); }
.leavequeue-count {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-muted);
  background: var(--fill-hover);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-full);
  padding: 1px 8px;
  margin-left: var(--space-2);
}
.leavequeue-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
  background: var(--surface-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-1);
  padding: var(--space-3);
}
.leavequeue-main { display: grid; gap: 2px; }
.leavequeue-who { font: 600 14px/1.4 var(--font-body); color: var(--color-primary); }
.leavequeue-what { font: 400 13px/1.5 var(--font-body); color: var(--color-primary); }
.leavequeue-days { font-family: var(--font-mono); font-size: 11px; color: var(--color-muted); }
.leavequeue-reason { font: 400 12px/1.5 var(--font-body); color: var(--color-muted); }
.leavequeue-actions { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.leavequeue-reject { display: flex; gap: var(--space-2); }
.leavequeue-reject input { width: 220px; }
```

- [ ] **Step 4: Gate, eyeball, commit**

Run dev server; as `billing@example.com` see the queue on `/leave`, approve/decline a request; as `ops@example.com` confirm the section is absent.
Run: `npm run check` → exit 0.

```bash
git add src/routes/_app/leave.tsx src/styles/global.css
git commit -m "feat: leave moderation queue"
```

---

### Task C3: Leave types admin page

**Files:**
- Create: `src/routes/_app/admin/leave.tsx`
- Modify: `src/routes/_app/admin/route.tsx` (subnav link — the subnav lives there)
- Modify (generated churn): `src/routeTree.gen.ts`

**Interfaces:**
- Consumes: `listLeaveTypesFn`, `upsertLeaveTypeFn` from B3; `LeaveTypeInput` schema; `Button`, `applyServerError`, `Plus` icon.
- Produces: `/admin/leave` — admin-managed leave type definitions.

- [ ] **Step 1: Add the subnav link**

In `src/routes/_app/admin/route.tsx`, after the Workers link (match the existing subnav markup exactly):

```tsx
        <Link to="/admin/leave" activeProps={{ className: 'active' }}>
          Leave types
        </Link>
```

- [ ] **Step 2: Write the route**

```tsx
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { Plus } from 'reicon-react'
import { Button } from '~/components/ui/button'
import { applyServerError } from '~/components/forms/applyServerError'
import { LeaveTypeInput } from '~/lib/schemas/leave'
import { listLeaveTypesFn, upsertLeaveTypeFn } from '~/server/fns/leave'
import type { LeaveTypeView } from '~/server/fns/leave'

export const Route = createFileRoute('/_app/admin/leave')({
  loader: async () => ({ types: await listLeaveTypesFn() }),
  component: LeaveTypesPage,
})

const METHODS: { value: 'annual_allotment' | 'monthly_prorata' | 'per_hours_worked'; label: string }[] = [
  { value: 'annual_allotment', label: 'Annual allotment' },
  { value: 'monthly_prorata', label: 'Monthly pro-rata' },
  { value: 'per_hours_worked', label: 'Per hours worked' },
]

const BASES: { value: 'calendar' | 'anniversary'; label: string }[] = [
  { value: 'calendar', label: 'Calendar year' },
  { value: 'anniversary', label: 'Hire anniversary' },
]

function LeaveTypesPage() {
  const router = useRouter()
  const { types } = Route.useLoaderData() as { types: LeaveTypeView[] }

  return (
    <main className="admin">
      <div className="admin-head">
        <h1>Leave types</h1>
        <span className="spacer" />
        <label className="checkline">
          <input type="checkbox" checked readOnly /> Paid types accrue; unpaid types never check balance
        </label>
      </div>
      {types.map((t) => (
        <TypeCard key={t.id} type={t} onDone={() => void router.invalidate()} />
      ))}
      <TypeCard type={null} onDone={() => void router.invalidate()} />
    </main>
  )
}

function TypeCard({ type, onDone }: { type: LeaveTypeView | null; onDone: () => void }) {
  const isEdit = type !== null
  const form = useForm({
    defaultValues: {
      name: type?.name ?? '',
      paid: type?.paid ?? true,
      accrualMethod: type?.accrualMethod ?? 'annual_allotment',
      minutesPerYear: type ? Math.round(type.minutesPerYear / 60) : 0,
      accrualRatePer10k: type?.accrualRatePer10k ?? 0,
      carryOverMinutes: type ? Math.round(type.carryOverMinutes / 60) : 0,
      yearBasis: type?.yearBasis ?? 'calendar',
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(1, 'Name is required').max(100),
        minutesPerYear: z.number().int().min(0).max(10000),
        accrualRatePer10k: z.number().int().min(0).max(10000),
        carryOverMinutes: z.number().int().min(0).max(10000),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await upsertLeaveTypeFn({
          data: {
            id: type?.id,
            name: value.name,
            paid: value.paid,
            accrualMethod: value.accrualMethod,
            minutesPerYear: value.minutesPerYear * 60,
            accrualRatePer10k: value.accrualRatePer10k,
            carryOverMinutes: value.carryOverMinutes * 60,
            yearBasis: value.yearBasis,
          },
        })
        form.reset()
        await router.invalidate()
      } catch (e) {
        applyServerError(form, e)
      }
    },
  })

  return (
    <form
      className={isEdit ? 'tree-client' : 'tree-add'}
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <div className="tree-row">
        <span className="name">{isEdit ? type.name : 'New type'}</span>
      </div>
      <div className="entryform-row">
        <form.Field name="name">
          {(field) => (
            <label className="field">
              <span>Name</span>
              <input
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                maxLength={100}
              />
            </label>
          )}
        </form.Field>
        <form.Field name="paid">
          {(field) => (
            <label className="checkline">
              <input
                type="checkbox"
                checked={field.state.value}
                onChange={(e) => field.handleChange(e.target.checked)}
              />{' '}
              Paid
            </label>
          )}
        </form.Field>
      </div>
      <div className="entryform-row">
        <form.Field name="accrualMethod">
          {(field) => (
            <label className="field">
              <span>Accrual</span>
              <select
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value as typeof field.state.value)}
              >
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>
          )}
        </form.Field>
        <form.Field name="yearBasis">
          {(field) => (
            <label className="field">
              <span>Year basis</span>
              <select
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value as typeof field.state.value)}
              >
                {BASES.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </label>
          )}
        </form.Field>
      </div>
      <div className="entryform-row">
        <form.Field name="minutesPerYear">
          {(field) => (
            <label className="field">
              <span>Hours per year</span>
              <input
                type="number"
                min="0"
                max="10000"
                value={field.state.value}
                onChange={(e) => field.handleChange(Number(e.target.value))}
              />
            </label>
          )}
        </form.Field>
        <form.Field name="accrualRatePer10k">
          {(field) => (
            <label className="field">
              <span>Minutes per 10k worked minutes</span>
              <input
                type="number"
                min="0"
                max="10000"
                value={field.state.value}
                onChange={(e) => field.handleChange(Number(e.target.value))}
              />
            </label>
          )}
        </form.Field>
        <form.Field name="carryOverMinutes">
          {(field) => (
            <label className="field">
              <span>Carry-over hours cap</span>
              <input
                type="number"
                min="0"
                max="10000"
                value={field.state.value}
                onChange={(e) => field.handleChange(Number(e.target.value))}
              />
            </label>
          )}
        </form.Field>
      </div>
      <div className="entryform-actions">
        <Button type="submit" variant="primary">
          {isEdit ? <Check size={14} /> : <Plus size={14} />} {isEdit ? 'Save' : 'Add type'}
        </Button>
      </div>
    </form>
  )
}
```

New imports to note: `Check` from `reicon-react` joins `Plus`. New copy (frozen once landed): `Leave types`, `Paid types accrue; unpaid types never check balance`, `New type`, `Name`, `Paid`, `Accrual`, `Year basis`, `Hours per year`, `Minutes per 10k worked minutes`, `Carry-over hours cap`, `Save`, `Add type`, `Annual allotment`, `Monthly pro-rata`, `Per hours worked`, `Calendar year`, `Hire anniversary`.

- [ ] **Step 3: Gate, eyeball, commit**

Eyeball as `admin@example.com`: edit existing seeded types, add a new one, watch it appear after invalidate.
Run: `npm run check` → exit 0.

```bash
git add src/routes/_app/admin/leave.tsx src/routes/_app/admin/route.tsx src/routeTree.gen.ts
git commit -m "feat: leave types admin page"
```

---

### Task C4: Reports subtab + CSV export

**Files:**
- Modify: `src/lib/schemas/reports.ts` (extend `ExportCsvInput`)
- Modify: `src/server/services/leave.ts` (add `leaveExportRows` — additive, no B2 changes)
- Modify: `src/server/services/exports.ts` (add `buildLeaveCsv` + `'leave'` branch)
- Modify: `src/server/fns/exports.ts` (if the fn validates against the schema, no change needed — verify)
- Modify: `src/routes/_app/reports.tsx` (subtab + table + export button)
- Test: the existing exports integration test file (find with `rg buildDailyCsv tests/`)

**Interfaces:**
- Consumes: `leaveReportFn` + `LeaveReportView` from B3 (subtab table); `PeriodInput`/`ExportCsvInput` from `~/lib/schemas/reports`; existing `SubTabs`/`SubId` machinery and the CSV download block in reports.tsx.
- Produces: `view: 'leave'` CSV + "Leave" subtab (billing/admin only); new service export `leaveExportRows`.

- [ ] **Step 1: Extend the schema**

In `src/lib/schemas/reports.ts`, change the enum:

```ts
export const ExportCsvInput = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  view: z.enum(['intervals', 'daily', 'leave']),
})
```

(Type export stays the same line, `z.infer` follows the schema.)

- [ ] **Step 2: Add `leaveExportRows` to the leave service**

`LeaveReportView` groups lose per-request detail, but the CSV needs one row per request. Add to `src/server/services/leave.ts` (additive — nothing in B2 changes):

```ts
export type LeaveExportRow = {
  workerName: string
  typeName: string
  startDay: string
  endDay: string
  minutes: number
  status: 'submitted' | 'approved' | 'rejected' | 'cancelled'
  decidedBy: string | null
}

export async function leaveExportRows(deps: Deps, ctx: SessionContext, input: PeriodInput): Promise<LeaveExportRow[]> {
  if (!hasRole(ctx, 'billing') && !hasRole(ctx, 'admin')) throw new HttpError(403, 'FORBIDDEN')
  const rows = await deps.db
    .select({
      startDay: leaveRequests.startDay,
      endDay: leaveRequests.endDay,
      minutes: leaveRequests.minutes,
      status: leaveRequests.status,
      workerId: leaveRequests.workerId,
      typeId: leaveRequests.typeId,
      decidedById: leaveRequests.decidedBy,
    })
    .from(leaveRequests)
    .where(and(gte(leaveRequests.startDay, input.from), lte(leaveRequests.startDay, input.to)))
  const names = await workerNames(deps) // same helper B2 uses; adjust the call to its actual signature
  const typeNames = new Map((await listLeaveTypes(deps, ctx)).map((t) => [t.id, t.name] as const))
  return rows.map((r) => ({
    workerName: names.get(r.workerId) ?? '?',
    typeName: typeNames.get(r.typeId) ?? '?',
    startDay: r.startDay,
    endDay: r.endDay,
    minutes: r.minutes,
    status: r.status,
    decidedBy: r.decidedById ? (names.get(r.decidedById) ?? '?') : null,
  }))
}
```

If `workerNames` in B2 is shaped differently (e.g. takes a row list), inline the same join instead — the point is: worker display name + type name per row, `?` fallbacks matching the approvals service convention.

- [ ] **Step 3: Add `buildLeaveCsv` to the exports service**

In `src/server/services/exports.ts`, mirror the shape of the existing builders. The fn layer resolves data: for `view: 'leave'`, call `leaveExportRows(deps, ctx, { from, to })` and build the CSV from it.

```ts
export function buildLeaveCsv(rows: LeaveExportRow[]): string {
  const head = ['worker', 'type', 'startDay', 'endDay', 'hours', 'status', 'decidedBy']
  const lines = [head.join(',')]
  for (const r of rows) {
    lines.push(
      [r.workerName, r.typeName, r.startDay, r.endDay, formatDecimalHours(r.minutes / 60), r.status, r.decidedBy ?? '']
        .map(csvEscape)
        .join(','),
    )
  }
  return lines.join('\n') + '\n'
}
```

Import `LeaveExportRow` as a type from `~/server/services/leave`. Use the existing `csvEscape` helper in the file (match its actual name — read the file first) and `formatDecimalHours` from `~/lib/money`. `buildLeaveCsv` is pure — unit-testable like the other builders if they have unit tests (match the existing test layout).

Statuses in CSV: use the request status verbatim (`submitted`/`approved`/`rejected`/`cancelled`) — CSV is a data export, not UI copy.

- [ ] **Step 4: Wire the fn**

Check `src/server/fns/exports.ts`: it validates with `ExportCsvInput` and dispatches on `data.view`. Add the `'leave'` branch to call the service leave builder. If the fn already passes `ctx` through to a single service entry (e.g. `exportCsv(deps, ctx, input)`), only the service changes.

- [ ] **Step 5: Reports subtab**

In `src/routes/_app/reports.tsx`:
- Add `'leave'` to the `SubId` union (find `type SubId = ...`).
- The subtab list: add `{ id: 'leave', label: 'Leave' }` — but only render it when the route context has billing/admin (the route loader already loads `ctx`; follow how existing money-gated subtabs are hidden, e.g. `perJob` or the invoice link's visibility pattern; if no precedent, gate on `canSeeMoney(ctx)`).
- Subtab panel: table with columns `Worker | Type | Taken | Pending | Balance` (all `formatHmm`, mono cells), rows from `leaveReportFn({ data: { from, to } })` loaded in the subtab's data path the same way other subtabs load (follow the existing pattern for per-subtab loading in the loader or component — match siblings).
- Export button: the existing `Export CSV` button already sends `view: sub === 'recon' ? 'intervals' : 'daily'` — extend to `'leave'` when `sub === 'leave'`.

New copy (frozen once landed): `Leave`, `Worker`, `Taken`, `Pending`, `Balance`.

- [ ] **Step 6: Tests**

Add to `tests/integration/exports.service.test.ts` (or the file that tests the other CSV views — find it with `rg buildDailyCsv tests/`): a case that seeds an approved leave request via `submitLeaveRequest` + `approveLeaveRequest`, calls the export service with `view: 'leave'` as billing, and asserts the header line plus the approved row (including the approving moderator's name in `decidedBy`); a case asserting operator gets `FORBIDDEN`.

- [ ] **Step 7: Gate, eyeball, commit**

Eyeball `/reports` as billing: Leave subtab visible with rows; CSV downloads. As ops: subtab absent.
Run: `npm run check` → exit 0.

```bash
git add src/lib/schemas/reports.ts src/server/services/exports.ts src/server/fns/exports.ts src/routes/_app/reports.tsx tests/integration/exports.service.test.ts
git commit -m "feat: leave report tab and csv"
```

---

## Wave D — wrap-up

### Task D1: Docs + final gate

**Files:**
- Modify: `CLAUDE.md` (Where things are — add rows)
- Modify: `docs/DESIGN.md` only if new CSS primitives were introduced that belong in the reference (the `.leave*` block reuses existing card/table primitives — likely no change; check)

- [ ] **Step 1: Update CLAUDE.md**

Add to the "Where things are" table:

```markdown
| Leave types/requests math | `src/lib/leaveMath.ts` |
| Leave service + fns | `src/server/services/leave.ts`, `src/server/fns/leave.ts` |
```

- [ ] **Step 2: Final gates**

Run: `npm run check` → exit 0.
Run: `npm run test:contract` → all green (belt-and-braces; nothing under `tests/contract/` was touched).
Run: `npm run build` → exit 0.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore: leave wrap-up"
```

---

## Done criteria

- Every user-requested capability traceable: accruals (`leaveMath` + balances), requests + moderation (`submitLeaveRequest`/`approve`/`reject`/`cancel` + queue), reporting (`myLeave`, `leaveReport`, reports subtab, CSV).
- Balances are never stored — always computed from policy + requests + (for `per_hours_worked`) intervals.
- No money anywhere in leave (minutes only; no `cents` key ever appears).
- `tests/contract/` untouched (verify `git status` clean for that path after every task).
- Copy freeze respected: no existing user-visible string changed; new copy only on new screens.
- Error codes as locked in Global Constraints; guard order mirrors the approvals service.
- `npm run check` green at every commit; final `npm run test:contract` + `npm run build` green.


