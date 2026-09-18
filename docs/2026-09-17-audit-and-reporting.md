# Audit & Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the platform's trust story — an immutable interval edit history, configurable red-flag thresholds, rate transparency, a supervisor team view, weekly trends, realization, budgets, period deltas, exception-based bulk review, and an audit CSV export.

**Architecture:** Three waves. Wave A adds data (interval events, flag-threshold settings, job budgets). Wave B adds reports over existing + new data (trends, realization, budget vs actual, deltas). Wave C surfaces audit information and review UX (timeline, rate column, team view, bulk approve, audit CSV). Money fields follow the omit-key rule everywhere; every task is independently testable and committed.

**Tech Stack:** TanStack Start (createServerFn), Drizzle (D1, `npm run db:generate`), zod v4, vitest (unit + integration projects), existing hybrid design system (Button/StatusChip/[data-tip]).

## Global Constraints

- Node 24 via **nvm** (`.nvmrc`); the shell default is Node 21, so `export PATH=~/.nvm/versions/node/v24.19.0/bin:$PATH` before any npm/npx. Gate: `npm run check` exit 0 (contract-manifest + eslint + tsc + unit/integration; allow ~3 minutes). Belt-and-braces: `npm run test:contract`. `tsc` covers `tests/**`, so test files must typecheck too.
- `tests/contract/**` is untouchable. New tests go in `tests/unit` / `tests/integration` only.
- Migrations: `npm run db:generate`, never hand-edit; apply with `npm run db:migrate:local`. Next migrations are 0004, 0005, 0006 (one per Wave A task).
- No new dependencies. zod v4: `ctx.addIssue({ code: 'custom', ... })` when using superRefine.
- **Money (#5):** operators never receive a `cents`/`rateCents`-shaped key — build the object WITHOUT the key; never `null`/`0` as a placeholder. Applies to `rateCents` in audit rows and in event change-diffs.
- **Copy freeze:** all existing user-visible strings stay byte-identical. Each task lists its NEW copy (frozen once landed). The gap-flag detail string `(< 8h)` becomes `(< ${gapHours(cfg.gapMinWallMin)}h)` where `gapHours = (min) => String(Math.round((min / 60) * 100) / 100)` — no `Math.round` to whole hours (450 must read `7.5h`); byte-identical `8h` at the default 480.
- **Contract equality:** `phase5-reports.contract.test.ts:81` asserts `daily().totals.byClient[c1]` `toEqual` `reconciliation().clients[c1]` for billing. Never add keys to `ClientRecon` in one report and not the other; new per-client data goes in a sibling map on the report (see B2).
- **Seeded rates:** `src/server/fixtures/demo.ts` writes `rateCents` directly, so every seeded snapshot equals its job's current rate (position override never applied). Tests that need a divergent snapshot must create the interval through `createInterval`.
- **Seeded overlaps:** opWorker has seeded j1 intervals on day 0 (09–12 UTC) and day 2 (14–18 UTC). New test intervals for opWorker use day 4 (Sat, still inside week 2026-08-31 in Perth) like `intervals.test.ts` does.
- **Org settings leak:** `resetDb` re-seeds `org_settings` with `onConflictDoNothing`, so a test that changes settings leaks into later tests in the same file. Any test file that reads or writes settings resets the row in `beforeEach` (`db.delete(orgSettings)` + `insertDemo(db)`, the `settings.service.test.ts` pattern).
- **Fixed clock:** `deps().now()` is frozen, so events written in one test share `at`. Order event queries by `at` then `rowid` so create/edit/delete come back in insertion order.
- Services: `(deps: Deps, ctx: SessionContext, input)` in `src/server/services/*.ts`; fns are thin `createServerFn` wrappers (`authMw`, `ctxOf`, `runtimeDeps`) re-exporting service types. No new error codes in this plan.
- Test helpers (`tests/integration/helpers.ts`): `deps()` — fixed clock `DEMO_ANCHOR_MS + 5d` = **2026-09-05** (Saturday), tz **Australia/Perth**; `asUser('admin' | 'billing' | 'operator')`; `resetDb()` (wipes + re-seeds demo); `at(dayOffset, h, m)`; `ids` map. Integration pattern: `beforeEach(async () => { await resetDb() })`.
- Demo facts: anchor Monday **2026-08-31**; humans `ids.opWorker` ('Demo Operator'), `ids.billingWorker` ('Demo Billing'), `ids.adminWorker` — none supervised; agents `ids.agent1` 'Atlas' / `ids.agent2` 'Beacon' supervised by **opWorker**; opWorker holds position `posSenior` ($120/h — overrides job rates); jobs: `ids.j1` $140/h billable, `ids.j3` $120/h, `ids.j4` non-billable (null).
- `src/routeTree.gen.ts` churns only when routes are added (Task C3) — regenerate via `npm run build` and stage with that commit.
- Visual eyeball steps are deferred for human review when no browser is available; everything else (tests, gates, commits) is executed.

## Locked Decisions

1. **Interval events are a new table** (`interval_events`), not a JSON column: queryable, FK'd, exported. Rows are appended by the interval service on create/edit/delete; the edit row carries a `changes` JSON `{ field: { from, to } }` diff of `startedAt`/`endedAt`/`jobId`/`note`/`rateCents` (times as ISO strings; `rateCents` diff makes position re-snapshots visible).
2. **Flag thresholds live in org settings** (`flagGapMinWallMin`, `flagLateEntryDays`, `flagMultiEditOver`, all nullable → fall back to `src/lib/redFlags.ts` `defaults` at the approvals call sites). `redFlags(input, cfg)` already accepts cfg — no contract impact.
3. **Budgets are per job** (`jobs.budgetCents` nullable, `$`-free integer cents). `budgetCents` on `JobNode`/`JobRecon` is canSeeMoney-gated (omit-key).
4. **Realization = actual cents ÷ standard cents** where standard = the same minutes valued at the job's CURRENT `billableRateCents` (positions/mid-period changes make it diverge from 100%). Per client, billing-only. Carried as `ReconciliationReport.realization` (a sibling map keyed by clientId, present only for money viewers), NOT as fields on `ClientRecon` — see the contract-equality constraint.
5. **Trends are weekly aggregates** (wall/effort/premium/utilization) over the last N Mondays; org-wide, billing/admin only. Weekly utilization = wall ÷ (humans × defaultDayMinutes × 5): a week's denominator is five default days, not one (adminKpis is a single-day figure).
6. **The audit timeline merges** approval events + interval events, sorted newest-first; `rateCents` inside change-diffs is stripped for non-money viewers (#5).
7. **Bulk approve reuses `approveWeek` per row**, catching `HttpError` into per-row `{ ok, code }` results so one locked/self-approval week never blocks the rest.
8. **The audit CSV prefixes kinds** (`leave_`, `interval_`) to keep the single `kind` column unambiguous; it is billing/admin-only because interval diffs contain rate money.

## Feature → Task Map

| Feature | Task |
|---|---|
| 1. Interval edit history | A1 (data) + C1 (display) |
| 2. Rate transparency | C2 |
| 3. Supervisor team view | C3 |
| 4. Weekly trends | B1 |
| 5. Realization rate | B2 |
| 6. Budget vs actual | A3 (schema) + B3 (report) |
| 7. Period-over-period deltas | B4 |
| 8. Configurable flag thresholds | A2 |
| 9. Exception-based review + bulk approve | C4 |
| 10. Audit CSV export | C5 |

## File Structure

| File | Responsibility |
|---|---|
| `drizzle/schema.ts` | + `intervalEvents` table, + 3 flag columns on `orgSettings`, + `jobs.budgetCents` |
| `drizzle/migrations/**` | 0004 / 0005 / 0006, generated |
| `src/server/services/intervals.ts` | emits interval events on create/update/delete |
| `src/server/services/settings.ts`, `src/lib/schemas/settings.ts` | threshold get/set |
| `src/lib/redFlags.ts` | templated gap detail (byte-identical at default) |
| `src/server/services/approvals.ts` | cfg wiring, audit events in week view, rate on audit rows, `listTeamWeeks`, `approveWeeksBulk` |
| `src/server/services/reports.ts` | `weeklyTrends`, realization, per-job budget, `loadPieces` jobIds filter |
| `src/server/services/structure.ts`, `src/lib/schemas/structure.ts` | budget create/update/view |
| `src/server/services/exports.ts`, `src/lib/schemas/reports.ts` | `events` CSV view |
| `src/server/fns/{approvals,reports}.ts` | new fns |
| `src/routes/_app/team.tsx` (new), `src/routes/_app/{approvals,reports,route}.tsx`, `src/routes/_app/admin/settings.tsx` | UI |
| `src/components/{approvalsQueue,approverView,reconTable,structureTree}.tsx` | UI |
| `tests/unit/redFlags.test.ts`, `tests/integration/{intervals,settings.service,reports.service,approvals.service,exports.service,structure}.test.ts` | tests |

---

### Task A1: interval edit history (table + emission)

**Files:**
- Modify: `drizzle/schema.ts` (after the `intervals` table block)
- Modify: `drizzle/migrations/**` (generate)
- Modify: `src/server/services/intervals.ts`
- Modify: `tests/integration/helpers.ts` (resetDb order)
- Test: `tests/integration/intervals.test.ts` (append)

**Interfaces:**
- Produces: table `schema.intervalEvents` `{ id, intervalId → intervals.id, kind: 'create' | 'edit' | 'delete', actorWorkerId, changes: string | null (JSON), at }`; C1 reads it, C5 exports it. Emission is internal to the interval service (no signature changes).

- [ ] **Step 1: Add the table**

In `drizzle/schema.ts`, directly after the `intervals` table definition (before `approvals`):

```ts
// ---- Interval edit history (audit) ----
export const intervalEvents = sqliteTable('interval_events', {
  id: text('id').primaryKey(),
  intervalId: text('interval_id')
    .notNull()
    .references(() => intervals.id),
  kind: text('kind', { enum: ['create', 'edit', 'delete'] }).notNull(),
  actorWorkerId: text('actor_worker_id').notNull(),
  changes: text('changes'), // JSON { field: { from, to } }; null for create/delete
  at: ts('at').notNull(),
})
```

- [ ] **Step 2: Generate + apply the migration**

```bash
npm run db:generate && npm run db:migrate:local
```

Expected: a new `0004_*` migration creating `interval_events`.

- [ ] **Step 3: Update resetDb**

In `tests/integration/helpers.ts` `resetDb`, add as the FIRST delete (FK: `interval_events` → `intervals`, and `intervals` is deleted later in the same batch):

```ts
db.delete(schema.intervalEvents),
```

- [ ] **Step 4: Write the failing tests**

Append to `tests/integration/intervals.test.ts` (inside the existing top-level describe or a new `describe('interval events')`; imports already available — add `asc` and `sql` to the drizzle-orm import if missing). The clock is frozen, so `at` ties; `rowid` is the tiebreak:

```ts
describe('interval events', () => {
  const events = async (intervalId: string) =>
    db
      .select()
      .from(schema.intervalEvents)
      .where(eq(schema.intervalEvents.intervalId, intervalId))
      .orderBy(asc(schema.intervalEvents.at), sql`rowid`)
      .all()

  it('create emits a create event', async () => {
    const iv = await createInterval(deps(), asUser('billing'), {
      workerId: ids.billingWorker, jobId: ids.j1,
      startedAt: at(1, 9).toISOString(), endedAt: at(1, 11).toISOString(),
    })
    const evs = await events(iv.id)
    expect(evs.map((e) => e.kind)).toEqual(['create'])
    expect(evs[0]!.actorWorkerId).toBe(ids.billingWorker)
    expect(evs[0]!.changes).toBeNull()
  })

  it('note edit emits an edit event with the note diff', async () => {
    const iv = await createInterval(deps(), asUser('billing'), {
      workerId: ids.billingWorker, jobId: ids.j1,
      startedAt: at(1, 9).toISOString(), endedAt: at(1, 11).toISOString(),
    })
    await updateInterval(deps(), asUser('billing'), { id: iv.id, note: 'focus' })
    const evs = await events(iv.id)
    expect(evs.map((e) => e.kind)).toEqual(['create', 'edit'])
    const changes = JSON.parse(evs[1]!.changes!) as { note: { from: unknown; to: unknown } }
    expect(changes.note).toEqual({ from: null, to: 'focus' })
  })

  it('job change records jobId and rateCents diffs', async () => {
    const iv = await createInterval(deps(), asUser('billing'), {
      workerId: ids.billingWorker, jobId: ids.j1,
      startedAt: at(1, 9).toISOString(), endedAt: at(1, 11).toISOString(),
    })
    await updateInterval(deps(), asUser('billing'), { id: iv.id, jobId: ids.j3 })
    const changes = JSON.parse((await events(iv.id))[1]!.changes!) as Record<string, { from: unknown; to: unknown }>
    expect(changes.jobId).toEqual({ from: ids.j1, to: ids.j3 })
    expect(changes.rateCents).toEqual({ from: 14000, to: 12000 }) // billingWorker has no position; j1 $140 → j3 $120
  })

  it('delete emits a delete event', async () => {
    const iv = await createInterval(deps(), asUser('billing'), {
      workerId: ids.billingWorker, jobId: ids.j1,
      startedAt: at(1, 9).toISOString(), endedAt: at(1, 11).toISOString(),
    })
    await deleteInterval(deps(), asUser('billing'), { id: iv.id })
    const evs = await events(iv.id)
    expect(evs.map((e) => e.kind)).toEqual(['create', 'delete'])
  })
})
```

- [ ] **Step 5: Run to verify it fails**

Run: `npx vitest run tests/integration/intervals.test.ts`
Expected: FAIL — no rows in `interval_events` (emission not implemented).

- [ ] **Step 6: Implement the emission**

In `src/server/services/intervals.ts`, add after the `liveJob` helper (module scope):

```ts
type IntervalChanges = Record<string, { from: unknown; to: unknown }>

function intervalEventRow(
  intervalId: string,
  kind: 'create' | 'edit' | 'delete',
  actorWorkerId: string,
  changes: IntervalChanges | null,
  at: Date,
) {
  return {
    id: crypto.randomUUID(),
    intervalId,
    kind,
    actorWorkerId,
    changes: changes === null ? null : JSON.stringify(changes),
    at,
  }
}

/* Audit diff of the mutable fields; times as ISO. The rateCents diff makes
   position re-snapshots visible to reviewers (#18, #positions). */
function diffInterval(
  cur: IntervalRow,
  next: Pick<IntervalRow, 'startedAt' | 'endedAt' | 'jobId' | 'note' | 'rateCents'>,
): IntervalChanges {
  const out: IntervalChanges = {}
  if (cur.startedAt.getTime() !== next.startedAt.getTime())
    out.startedAt = { from: cur.startedAt.toISOString(), to: next.startedAt.toISOString() }
  if (cur.endedAt.getTime() !== next.endedAt.getTime())
    out.endedAt = { from: cur.endedAt.toISOString(), to: next.endedAt.toISOString() }
  if (cur.jobId !== next.jobId) out.jobId = { from: cur.jobId, to: next.jobId }
  if (cur.note !== next.note) out.note = { from: cur.note, to: next.note }
  if (cur.rateCents !== next.rateCents) out.rateCents = { from: cur.rateCents, to: next.rateCents }
  return out
}
```

Then three insertions:
- `createInterval` — after `await db.insert(schema.intervals).values(row)`:

```ts
  await db.insert(schema.intervalEvents).values(intervalEventRow(row.id, 'create', ctx.workerId, null, now))
```

- `updateInterval` — the `updated` literal is currently built AFTER `resetSubmittedWeeks`; move it above that call, then insert the event between them:

```ts
  await db.insert(schema.intervalEvents).values(
    intervalEventRow(cur.id, 'edit', ctx.workerId, diffInterval(cur, updated), now),
  )
```

  An edit with an empty diff still emits an `edit` row (`changes: {}`), matching `editCount` which also increments on a no-op save.

- `deleteInterval` — after the soft-delete `db.update(...)`:

```ts
  await db.insert(schema.intervalEvents).values(intervalEventRow(cur.id, 'delete', ctx.workerId, null, now))
```

- [ ] **Step 7: Verify + gate + commit**

Run: `npx vitest run tests/integration/intervals.test.ts` → PASS. Run: `npm run check` → exit 0.

```bash
git add drizzle/schema.ts drizzle/migrations src/server/services/intervals.ts tests/integration/helpers.ts tests/integration/intervals.test.ts
git commit -m "feat: interval edit history"
```

### Task A2: configurable red-flag thresholds

**Files:**
- Modify: `drizzle/schema.ts` (`orgSettings` table), `drizzle/migrations/**` (generate)
- Modify: `src/lib/schemas/settings.ts`, `src/server/services/settings.ts`
- Modify: `src/lib/redFlags.ts` (detail template only)
- Modify: `src/server/services/approvals.ts` (cfg at both call sites)
- Modify: `src/routes/_app/admin/settings.tsx`
- Test: `tests/unit/redFlags.test.ts` (append), `tests/integration/settings.service.test.ts` (append)

**Interfaces:**
- Consumes: `redFlags(input, cfg)` (cfg param already exists), `defaults` export in `src/lib/redFlags.ts`, `getOrgSettings`/`updateOrgSettings` in `src/server/services/settings.ts`.
- Produces: `OrgSettingsInput`/`OrgSettingsView` gain `flagGapMinWallMin`, `flagLateEntryDays`, `flagMultiEditOver` (`number | null`, null = built-in default). A2 exports (for this file and C3): a private helper in approvals.ts

```ts
function flagsCfg(s: OrgSettingsView) {
  return {
    gapMinWallMin: s.flagGapMinWallMin ?? flagDefaults.gapMinWallMin,
    lateEntryDays: s.flagLateEntryDays ?? flagDefaults.lateEntryDays,
    multiEditOver: s.flagMultiEditOver ?? flagDefaults.multiEditOver,
  }
}
```

- [ ] **Step 1: Schema + migration**

In `drizzle/schema.ts` `orgSettings`, after `defaultWeeklyTargetHours`:

```ts
  flagGapMinWallMin: integer('flag_gap_min_wall_min'), // null = built-in default (src/lib/redFlags.ts)
  flagLateEntryDays: integer('flag_late_entry_days'),
  flagMultiEditOver: integer('flag_multi_edit_over'),
```

```bash
npm run db:generate && npm run db:migrate:local
```

- [ ] **Step 2: Failing tests**

Append to `tests/integration/settings.service.test.ts` (imports already in file):

```ts
it('round-trips flag thresholds; null clears to the built-in default', async () => {
  await updateOrgSettings(deps(), asUser('admin'), { flagGapMinWallMin: 240, flagLateEntryDays: 14, flagMultiEditOver: 5 })
  const s = await getOrgSettings(deps(), asUser('billing'))
  expect(s.flagGapMinWallMin).toBe(240)
  expect(s.flagLateEntryDays).toBe(14)
  expect(s.flagMultiEditOver).toBe(5)
  await updateOrgSettings(deps(), asUser('admin'), { flagGapMinWallMin: null })
  expect((await getOrgSettings(deps(), asUser('billing'))).flagGapMinWallMin).toBeNull()
})

it('thresholds drive gap flags in the week view', async () => {
  // A worker with no intervals this week gets 5 gap flags at the default 480.
  await db.insert(schema.workers).values({ id: 'w-fresh', kind: 'human', createdAt: at(-10, 0) }).onConflictDoNothing()
  const before = await getWeekForApproval(deps(), asUser('billing'), { workerId: 'w-fresh', weekStart: '2026-08-31' })
  expect(before.flags.filter((f) => f.kind === 'gap')).toHaveLength(5)
  await updateOrgSettings(deps(), asUser('admin'), { flagGapMinWallMin: 0 })
  const after = await getWeekForApproval(deps(), asUser('billing'), { workerId: 'w-fresh', weekStart: '2026-08-31' })
  expect(after.flags.filter((f) => f.kind === 'gap')).toHaveLength(0)
})
```

Add the imports the test file needs: `getWeekForApproval` from `~/server/services/approvals`. (`at`, `db`, `schema`, `deps`, `asUser` already imported there; if `at` is not, import from `./helpers`.)

Append to `tests/unit/redFlags.test.ts`:

The file already has `toIv`, `piecesOf`, `WEEK`, `DAY` (= 2026-09-02), `TZ`, `worker` builders. Reuse them:

```ts
it('templates the gap threshold into the detail (byte-identical at default)', () => {
  const ivs = [toIv(['a', '09:00', '14:00'])] // 300 wall min → "Only N min" branch
  const input = { weekStart: WEEK, tz: TZ, worker, intervals: ivs, pieces: piecesOf(ivs) }
  const onDay = (flags: ReturnType<typeof redFlags>) => flags.find((f) => f.kind === 'gap' && f.day === DAY)!.detail
  expect(onDay(redFlags(input))).toBe(`Only 300 min on ${DAY} (< 8h).`)
  expect(onDay(redFlags(input, { gapMinWallMin: 450, lateEntryDays: 7, multiEditOver: 2 }))).toBe(`Only 300 min on ${DAY} (< 7.5h).`)
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/unit/redFlags.test.ts tests/integration/settings.service.test.ts`
Expected: FAIL (settings fields don't exist; detail still hardcodes 8h).

- [ ] **Step 4: Implement**

`src/lib/schemas/settings.ts` — add to `OrgSettingsInput`:

```ts
  flagGapMinWallMin: z.number().int().min(0).max(1440).nullish(),
  flagLateEntryDays: z.number().int().min(0).max(90).nullish(),
  flagMultiEditOver: z.number().int().min(0).max(50).nullish(),
```

and to `OrgSettingsView`: `flagGapMinWallMin: number | null`, `flagLateEntryDays: number | null`, `flagMultiEditOver: number | null`.

`src/server/services/settings.ts` — `getOrgSettings` return adds:

```ts
    flagGapMinWallMin: row?.flagGapMinWallMin ?? null,
    flagLateEntryDays: row?.flagLateEntryDays ?? null,
    flagMultiEditOver: row?.flagMultiEditOver ?? null,
```

`updateOrgSettings` patch block adds (same pattern as `defaultWeeklyTargetHours`):

```ts
  if (input.flagGapMinWallMin !== undefined) patch.flagGapMinWallMin = input.flagGapMinWallMin
  if (input.flagLateEntryDays !== undefined) patch.flagLateEntryDays = input.flagLateEntryDays
  if (input.flagMultiEditOver !== undefined) patch.flagMultiEditOver = input.flagMultiEditOver
```

`src/lib/redFlags.ts` `gapFlags` detail (keep byte-identical at default; NOT `Math.round` to whole hours — 450 must read `7.5h`):

```ts
// 480 → "8", 450 → "7.5", 500 → "8.33"
const gapHours = (min: number) => String(Math.round((min / 60) * 100) / 100)
...
        detail: wall === 0 ? `No time logged on ${day}.` : `Only ${Math.round(wall)} min on ${day} (< ${gapHours(cfg.gapMinWallMin)}h).`,
```

`src/server/services/approvals.ts` — import `{ getOrgSettings, type OrgSettingsView }` from `'./settings'` and `{ defaults as flagDefaults }` from `'~/lib/redFlags'`; add the `flagsCfg` helper (Interfaces block above). In `listPendingWeeks`, before the loop:

```ts
  const cfg = flagsCfg(await getOrgSettings(deps, ctx))
```

and change `redFlags(flagInput)` → `redFlags(flagInput, cfg)`. In `getWeekForApproval`, before the `flags` computation:

```ts
  const cfg = flagsCfg(await getOrgSettings(deps, ctx))
```

and change `redFlags({ ... })` → `redFlags({ ... }, cfg)`.

- [ ] **Step 5: Settings page fields**

`src/routes/_app/admin/settings.tsx` — `FormInput` adds:

```ts
  gapWallHours: z.string(), // '' = default, numeric text = hours
  lateEntryDays: z.string(),
  multiEditOver: z.string(),
```

`defaultValues` adds:

```ts
      gapWallHours: settings.flagGapMinWallMin != null ? String(settings.flagGapMinWallMin / 60) : '',
      lateEntryDays: settings.flagLateEntryDays != null ? String(settings.flagLateEntryDays) : '',
      multiEditOver: settings.flagMultiEditOver != null ? String(settings.flagMultiEditOver) : '',
```

`superRefine` adds:

```ts
        if (v.gapWallHours !== '' && !/^\d+(\.\d{1,2})?$/.test(v.gapWallHours))
          ctx.addIssue({ code: 'custom', path: ['gapWallHours'], message: 'Enter hours like 8 or 7.5, or leave blank' })
        if (v.lateEntryDays !== '' && !/^\d{1,2}$/.test(v.lateEntryDays))
          ctx.addIssue({ code: 'custom', path: ['lateEntryDays'], message: 'Enter whole days 0-90, or leave blank' })
        if (v.multiEditOver !== '' && !/^\d{1,2}$/.test(v.multiEditOver))
          ctx.addIssue({ code: 'custom', path: ['multiEditOver'], message: 'Enter a count 0-50, or leave blank' })
```

`onSubmit` data adds:

```ts
            flagGapMinWallMin: value.gapWallHours === '' ? null : Math.round(Number(value.gapWallHours) * 60),
            flagLateEntryDays: value.lateEntryDays === '' ? null : Number(value.lateEntryDays),
            flagMultiEditOver: value.multiEditOver === '' ? null : Number(value.multiEditOver),
```

and three new `<form.Field>` blocks after `weeklyTargetHours` (new copy, frozen once landed):

```tsx
        <form.Field name="gapWallHours">
          {(field) => (
            <label className="field">
              <span>Gap threshold (hours)</span>
              <input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="8" inputMode="decimal" />
              <span className="status-msg">A Mon–Fri day with wall-clock below this flags for review</span>
            </label>
          )}
        </form.Field>
        <form.Field name="lateEntryDays">
          {(field) => (
            <label className="field">
              <span>Late-entry window (days)</span>
              <input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="7" inputMode="numeric" />
              <span className="status-msg">Entries created this many days after the week ends flag</span>
            </label>
          )}
        </form.Field>
        <form.Field name="multiEditOver">
          {(field) => (
            <label className="field">
              <span>Edit threshold (count)</span>
              <input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="2" inputMode="numeric" />
              <span className="status-msg">Entries edited more than this many times flag</span>
            </label>
          )}
        </form.Field>
```

- [ ] **Step 6: Verify + gate + commit**

Run: `npx vitest run tests/unit/redFlags.test.ts tests/integration/settings.service.test.ts` → PASS. Run: `npm run check` → exit 0 (existing tests unaffected — seeded settings row leaves the new columns null).

```bash
git add drizzle/schema.ts drizzle/migrations src/lib/schemas/settings.ts src/server/services/settings.ts src/lib/redFlags.ts src/server/services/approvals.ts src/routes/_app/admin/settings.tsx tests/unit/redFlags.test.ts tests/integration/settings.service.test.ts
git commit -m "feat: configurable red flag thresholds"
```

---

### Task A3: job budgets (schema + admin form)

**Files:**
- Modify: `drizzle/schema.ts` (`jobs`), `drizzle/migrations/**` (generate)
- Modify: `src/lib/schemas/structure.ts`, `src/server/services/structure.ts`
- Modify: `src/components/structureTree.tsx`
- Test: `tests/integration/structure.test.ts` (append)

**Interfaces:**
- Consumes: existing `createJob`/`updateJob`/`listStructure`, `centsToDollarsInput`/`parseDollars` helpers in structureTree.tsx.
- Produces: `CreateJobInput.budgetCents` (nullish; `UpdateJobInput` picks it up via `.partial()` — verify and, if `UpdateJobInput` is declared independently, add the same field there), `JobNode.budgetCents?: number | null` present only when `canSeeMoney(ctx)` (#5 omit-key). B3 consumes `jobs.budgetCents` in reports.

- [ ] **Step 1: Schema + migration**

In `drizzle/schema.ts` `jobs`, after `billableRateCents`:

```ts
  budgetCents: integer('budget_cents'), // optional total budget; money → canSeeMoney only (#5)
```

```bash
npm run db:generate && npm run db:migrate:local
```

- [ ] **Step 2: Failing tests**

Append to `tests/integration/structure.test.ts`:

```ts
it('jobs carry an optional budget, money-gated in the tree', async () => {
  const live = { includeArchived: false } // listStructure takes the ListStructureInput object, not a boolean
  const { id } = await createJob(deps(), asUser('admin'), { projectId: ids.p1, name: 'Budgeted job', budgetCents: 50_000 })
  const adminTree = await listStructure(deps(), asUser('admin'), live)
  const node = adminTree.flatMap((c) => c.projects).flatMap((p) => p.jobs).find((j) => j.id === id)!
  expect(node.budgetCents).toBe(50_000)

  const opsTree = await listStructure(deps(), asUser('operator'), live)
  const opsNode = opsTree.flatMap((c) => c.projects).flatMap((p) => p.jobs).find((j) => j.id === id)!
  expect('budgetCents' in opsNode).toBe(false) // #5: key omitted, never null

  await updateJob(deps(), asUser('admin'), { id, budgetCents: 75_000 })
  const after = await listStructure(deps(), asUser('admin'), live)
  expect(after.flatMap((c) => c.projects).flatMap((p) => p.jobs).find((j) => j.id === id)!.budgetCents).toBe(75_000)
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/integration/structure.test.ts` → FAIL.

- [ ] **Step 4: Implement**

`src/lib/schemas/structure.ts` `CreateJobInput` adds: `budgetCents: z.number().int().min(0).max(1_000_000_000).nullish(),` (and the same on `UpdateJobInput` if it is not `CreateJobInput.partial()`).

`src/server/services/structure.ts`:
- `JobNode` type: `export type JobNode = { id: string; name: string; archivedAt: Date | null; billableRateCents?: number | null; budgetCents?: number | null }`
- `listStructure` job-node builder: where `billableRateCents` is spread for money viewers, add `budgetCents: j.budgetCents` in the same conditional object.
- `createJob` insert adds `budgetCents: input.budgetCents ?? null,` (after `billableRateCents: rate,`).
- `updateJob` patch adds `if (input.budgetCents !== undefined) patch.budgetCents = input.budgetCents`.

`src/components/structureTree.tsx` `JobRow`:
- state: `const [budget, setBudget] = useState(centsToDollarsInput(node.budgetCents ?? null))`
- edit form: after the rate input add

```tsx
        <input
          className="tree-input"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="Budget $"
          aria-label="Budget in dollars"
        />
```

  and change the submit to parse both (new copy 'Budget $' / 'Budget in dollars'):

```tsx
          const parsed = parseDollars(rate)
          const parsedBudget = parseDollars(budget)
          if (!parsed.ok) { setFieldError(parsed.error); return }
          if (!parsedBudget.ok) { setFieldError(parsedBudget.error); return }
          if (!name.trim()) return
          setFieldError(null)
          void run(() =>
            updateJobFn({ data: { id: node.id, name: name.trim(), billableRateCents: parsed.cents, budgetCents: parsedBudget.cents } }),
          ).then((ok) => { if (ok) setEditing(false) })
```

- read row: after the `rate` span add `{node.budgetCents != null && <span className="rate">{formatCents(node.budgetCents)} budget</span>}` — import `formatCents` from `~/lib/money` if missing.
- create-job form (the `tree-add` form near the bottom): add the same budget input + `budgetCents: parsedBudget.cents` in the `createJobFn` call (mirror the edit-form parse pattern).

- [ ] **Step 5: Verify + gate + commit**

Run: `npx vitest run tests/integration/structure.test.ts` → PASS. Run: `npm run check` → exit 0.

```bash
git add drizzle/schema.ts drizzle/migrations src/lib/schemas/structure.ts src/server/services/structure.ts src/components/structureTree.tsx tests/integration/structure.test.ts
git commit -m "feat: job budgets"
```

---

### Task B1: weekly trends report

**Files:**
- Modify: `src/lib/schemas/reports.ts` (add `WeeksInput`)
- Modify: `src/server/services/reports.ts`
- Modify: `src/server/fns/reports.ts`
- Modify: `src/routes/_app/reports.tsx`
- Test: `tests/integration/reports.service.test.ts` (append)

**Interfaces:**
- Produces: `export type WeekTrend = { weekStart: string; wallClockMin: number; effortMin: number; premiumMin: number; utilization: number }`, `export const WeeksInput = z.object({ weeks: z.number().int().min(1).max(26).default(8) })`, `export async function weeklyTrends(deps, ctx, input: WeeksInput): Promise<WeekTrend[]>`, `export const weeklyTrendsFn` (GET + validator `WeeksInput`).

- [ ] **Step 1: Schema**

In `src/lib/schemas/reports.ts`, add alongside `ExportCsvInput`:

```ts
export const WeeksInput = z.object({ weeks: z.number().int().min(1).max(26).default(8) })
export type WeeksInput = z.infer<typeof WeeksInput>
```

- [ ] **Step 2: Failing tests**

Append to `tests/integration/reports.service.test.ts`:

The existing `adminKpis` test in this file sets `defaultDayMinutes: 240` and `resetDb` does not undo it (see Global Constraints, "Org settings leak"). Change the file's `beforeEach` to the settings-test pattern first:

```ts
import { orgSettings } from '../../drizzle/schema'
import { insertDemo } from '~/server/fixtures/demo'
import { db } from './helpers'

beforeEach(async () => {
  await resetDb()
  await db.delete(orgSettings)
  await insertDemo(db)
})
```

Then append:

```ts
import { weeklyTrends } from '~/server/services/reports'

it('weeklyTrends aggregates the anchor week for billing only', async () => {
  const rows = await weeklyTrends(deps(), asUser('billing'), { weeks: 8 })
  expect(rows).toHaveLength(8)
  // Anchor Monday 2026-08-31 is the last row (oldest → newest, current week last).
  expect(rows[7]!.weekStart).toBe('2026-08-31')
  expect(rows[7]!.effortMin).toBeGreaterThan(0)
  expect(rows[0]!.effortMin).toBe(0)
  // Seeded week wall = 1440 min (op 780 + Atlas 480 + Beacon 180); 3 humans × 480 × 5 = 7200 → 0.2.
  expect(rows[7]!.utilization).toBeCloseTo(0.2, 5)
  await expect(weeklyTrends(deps(), asUser('operator'), { weeks: 8 })).rejects.toMatchObject({ status: 403 })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/integration/reports.service.test.ts` → FAIL.

- [ ] **Step 4: Implement**

In `src/server/services/reports.ts`, add imports: `localDateOf` from `'~/lib/dayMath'`; `weekDates`, `isoWeekStart` from `'~/lib/week'`; `getOrgSettings` from `'./settings'`; `HttpError` from `'~/lib/errors'`; `and`/`eq`/`isNull` already imported. Also ensure `weekDates` is already imported (used in `adminKpis`); if not, add it.

After `adminKpis`, add:

```ts
export type WeekTrend = {
  weekStart: string
  wallClockMin: number
  effortMin: number
  premiumMin: number
  utilization: number
}

/* Org-wide weekly aggregates, oldest → newest, for the billing/admin tab.
   Utilization = wall-clock over (active humans × default day minutes × 5 weekdays);
   adminKpis' single-day denominator would read 100% for one day's work in a week. */
const WEEKDAYS = 5
export async function weeklyTrends(
  deps: Deps,
  ctx: SessionContext,
  input: z.infer<typeof WeeksInput>,
): Promise<WeekTrend[]> {
  if (!canSeeMoney(ctx)) throw new HttpError(403, 'FORBIDDEN')
  const { db, tz } = deps
  const settings = await getOrgSettings(deps, ctx)
  const humans = await db
    .select({ id: schema.workers.id })
    .from(schema.workers)
    .where(and(eq(schema.workers.kind, 'human'), isNull(schema.workers.archivedAt)))
    .all()
  const dayMinutes = settings.defaultDayMinutes
  const thisMondayMs = localDayBoundariesUtcMs(isoWeekStart(deps.now().getTime(), tz), tz).startMs
  const out: WeekTrend[] = []
  for (let i = input.weeks - 1; i >= 0; i--) {
    const weekStart = localDateOf(thisMondayMs - i * 7 * 86_400_000, tz)
    const days = weekDates(weekStart)
    const pieces = await loadPieces(deps, { from: weekStart, to: days[6]! })
    const r = recon(pieces)
    out.push({
      weekStart,
      wallClockMin: r.wallClockMin,
      effortMin: r.effortMin,
      premiumMin: r.premiumMin,
      utilization: humans.length > 0 ? r.wallClockMin / (humans.length * dayMinutes * WEEKDAYS) : 0,
    })
  }
  return out
}
```

`src/server/fns/reports.ts` — add:

```ts
import { WeeksInput } from '~/lib/schemas/reports'
import { weeklyTrends } from '~/server/services/reports'

export const weeklyTrendsFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(WeeksInput)
  .handler(({ data, context }) => weeklyTrends(runtimeDeps(), ctxOf(context), data))

export type { WeekTrend } from '~/server/services/reports'
```

- [ ] **Step 5: Wire the UI**

`src/routes/_app/reports.tsx`:
- `searchSchema.sub` enum: add `'trends'` → `sub: z.enum(['recon', 'daily', 'leave', 'trends']).optional()`, and `type SubId = 'recon' | 'daily' | 'leave' | 'trends'`.
- Loader, inside the `if (tab === 'billing' && ...)` branch, before the existing `if (sub === 'daily')` block, add:

```ts
      if (sub === 'trends') {
        const trends = await weeklyTrendsFn({ data: { weeks: 8 } })
        return { today: today.date, tz, ctx, tab, sub, from, to, trends }
      }
```

  Extend `ReportsView`'s `data` type with `trends?: import('~/server/services/reports').WeekTrend[]`.

- `BillingPanel` props: add `trends?: import('~/server/services/reports').WeekTrend[]`.
- Import `weeklyTrendsFn` from `~/server/fns/reports` (alongside existing `reconciliationFn` etc.). Add `formatWeekLabel` from `~/lib/dayMath` if not already imported, and `formatHmm` from `~/lib/money`.
- `SubTabs` tabs array: `tabs={[{ id: 'recon', label: 'Totals' }, { id: 'daily', label: 'Daily' }, { id: 'leave', label: 'Leave' }, { id: 'trends', label: 'Trends' }]}`.
- Export view map (around the `const view:` line): `sub === 'trends' ? 'intervals' :` — i.e. `sub === 'recon' || sub === 'trends' ? 'intervals' : sub === 'daily' ? 'daily' : 'leave'` (trends reuses the same CSV shape as Totals).
- Panel, after the existing `{sub === 'leave' && leave ? ... : null}` block, add:

```tsx
      {sub === 'trends' && trends ? (
        <section className="card">
          <h2>Weekly trends</h2>
          <table className="recontable">
            <thead><tr><th className="nm">Week</th><th>Wall clock</th><th>Effort</th><th>Overlap</th><th>Utilization</th></tr></thead>
            <tbody>
              {trends.map((t) => (
                <tr key={t.weekStart}>
                  <td className="nm">{formatWeekLabel(t.weekStart)}</td>
                  <td className="money">{formatHmm(t.wallClockMin)}</td>
                  <td className="money">{formatHmm(t.effortMin)}</td>
                  <td className="money">+{formatHmm(t.premiumMin)}</td>
                  <td className="money">{(t.utilization * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
```

New copy: 'Trends', 'Weekly trends', 'Week', 'Wall clock', 'Overlap' — document new copy.

- [ ] **Step 6: Verify + gate + commit**

Run: `npx vitest run tests/integration/reports.service.test.ts` → PASS. Run: `npm run check` → exit 0.

```bash
git add src/lib/schemas/reports.ts src/server/services/reports.ts src/server/fns/reports.ts src/routes/_app/reports.tsx tests/integration/reports.service.test.ts
git commit -m "feat: weekly trends report"
```

---

### Task B2: realization rate in reconciliation

**Files:**
- Modify: `src/server/services/reports.ts`
- Modify: `src/components/reconTable.tsx`
- Test: `tests/integration/reports.service.test.ts` (append)

**Interfaces:**
- Extends: `ReconciliationReport` with `realization?: Record<string, ClientRealization>` (keyed by clientId) where `export type ClientRealization = { standardCents: number; realizationPct: number | null }`. The key is present only when `canSeeMoney` (`#5` omit-key). `ClientRecon` is NOT touched: `phase5-reports.contract.test.ts:81` requires `daily().totals.byClient[c1]` to `toEqual` `reconciliation().clients[c1]`.

- [ ] **Step 1: Failing tests**

Append to `tests/integration/reports.service.test.ts`. Seeded intervals carry the job rate verbatim (fixture bypasses the position override), so create one through the service to get a divergent snapshot:

```ts
import { reconciliation } from '~/server/services/reports'
import { createInterval } from '~/server/services/intervals'
import { at } from './helpers'

it('reconciliation realization reflects position overrides', async () => {
  // opWorker holds posSenior ($120/h); j1 is $140/h → this interval snapshots 12_000 vs standard 14_000.
  await createInterval(deps(), asUser('operator'), {
    workerId: ids.opWorker, jobId: ids.j1,
    startedAt: at(4, 9).toISOString(), endedAt: at(4, 11).toISOString(),
  })
  const period = { from: '2026-08-31', to: '2026-09-06' }
  const report = await reconciliation(deps(), asUser('billing'), period)
  const c1 = report.realization![ids.c1]!
  expect(c1.realizationPct).not.toBeNull()
  expect(c1.realizationPct!).toBeLessThan(100)
  expect(c1.standardCents).toBeGreaterThan(0)
  // Seeded-only client: snapshots equal current rates → exactly 100%.
  expect(report.realization![ids.c2]!.realizationPct).toBe(100)

  const ops = await reconciliation(deps(), asUser('operator'), period)
  expect('realization' in ops).toBe(false)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/integration/reports.service.test.ts` → FAIL.

- [ ] **Step 3: Implement**

In `src/server/services/reports.ts`, ensure `minutesBetween` is imported from `'~/lib/dayMath'`; `moneyCents` from `'~/lib/money'` (both already available via `recon`'s deps); also import `inArray` from `drizzle-orm` if missing.

Types (near line 24): add `export type ClientRealization = { standardCents: number; realizationPct: number | null }` and extend `ReconciliationReport` to `{ clients: ClientRecon[]; total: RoleRecon; realization?: Record<string, ClientRealization> }`. `ClientRecon` stays as is.

Reorder the top of `reconciliation`: `const keepCents = canSeeMoney(ctx)` first; then `const pieces = await loadPieces(deps, input, scopeFor(ctx))`; then build `jobRates` from `pieces` (no second load); then `const byClient = groupBy(pieces, 'clientId')`:

```ts
  const keepCents = canSeeMoney(ctx)
  const pieces = await loadPieces(deps, input, scopeFor(ctx))
  // Standard value of the same minutes at current job rates. When a position
  // overrides the job rate at write time (#positions) the two diverge.
  const jobRates = new Map<string, number | null>()
  if (keepCents) {
    const jobIds = [...new Set(pieces.map((p) => p.jobId))]
    if (jobIds.length > 0) {
      const rows = await db
        .select({ id: schema.jobs.id, billableRateCents: schema.jobs.billableRateCents })
        .from(schema.jobs)
        .where(inArray(schema.jobs.id, jobIds))
        .all()
      for (const j of rows) jobRates.set(j.id, j.billableRateCents)
    }
  }
  const byClient = groupBy(pieces, 'clientId')
```

The existing block already does `pieces` → `byClient`; replace it with the above ordering. Keep the later `scopeFor` handling via `loadPieces`'s filter param (the `pieces` load already scopes correctly).

Leave the `clients` map untouched. After it, build the sibling map and attach it only for money viewers:

```ts
  const totalR = recon(pieces)
  const report: ReconciliationReport = { clients, total: makeRecon(totalR, keepCents) }
  if (keepCents) {
    const realization: Record<string, ClientRealization> = {}
    for (const [clientId, clientPieces] of byClient) {
      const standard = moneyCents(
        clientPieces.map((p) => ({ minutes: minutesBetween(p.startMs, p.endMs), rateCents: jobRates.get(p.jobId) ?? null })),
      )
      const actual = recon(clientPieces).cents
      realization[clientId] = { standardCents: standard, realizationPct: standard > 0 ? Math.round((actual / standard) * 100) : null }
    }
    report.realization = realization
  }
  return report
```

- [ ] **Step 4: Wire the table**

`src/components/reconTable.tsx`: `const showRealization = report.realization !== undefined`. Header

```tsx
          {showRealization ? <th className="money">Realization</th> : null}
```

row

```tsx
            {showRealization ? (
              <td className="money">{report.realization![c.clientId]?.realizationPct == null ? '—' : `${report.realization![c.clientId]!.realizationPct}%`}</td>
            ) : null}
```

and in `tfoot` an empty `<td className="money" />` when `showRealization` so the columns line up (per-client realization is enough for v1). New copy: 'Realization'.

- [ ] **Step 5: Verify + gate + commit**

Run: `npx vitest run tests/integration/reports.service.test.ts` → PASS. Run: `npm run check` → exit 0.

```bash
git add src/server/services/reports.ts src/components/reconTable.tsx tests/integration/reports.service.test.ts
git commit -m "feat: realization rate in reconciliation"
```

---

### Task B3: budget vs actual per job

**Files:**
- Modify: `src/server/services/reports.ts` (extend `loadPieces` filter + `perJob` budget columns)
- Modify: `src/routes/_app/reports.tsx` (render By-job card)
- Test: `tests/integration/reports.service.test.ts` (append)

**Interfaces:**
- Extends: `JobRecon` with `budgetCents?: number | null`, `consumedCents?: number`, `budgetPct?: number | null` (all `#5` money-gated). Extends private helper `loadIntervalsInRange`'s filter type with optional `jobIds?: string[]`.

- [ ] **Step 1: Failing tests**

Append to `tests/integration/reports.service.test.ts`:

```ts
import { perJob } from '~/server/services/reports'
import { updateJob } from '~/server/services/structure'

it('perJob carries budget vs consumed for billing only', async () => {
  await updateJob(deps(), asUser('admin'), { id: ids.j1, budgetCents: 1_000_000 })
  const rows = await perJob(deps(), asUser('billing'), { from: '2026-08-31', to: '2026-09-06' })
  const j1 = rows.find((r) => r.jobId === ids.j1)!
  expect(j1.budgetCents).toBe(1_000_000)
  expect(j1.consumedCents!).toBeGreaterThanOrEqual(0)
  expect(j1.budgetPct == null || typeof j1.budgetPct === 'number').toBe(true)
  const ops = await perJob(deps(), asUser('operator'), { from: '2026-08-31', to: '2026-09-06' })
  expect('budgetCents' in ops[0]!).toBe(false)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/integration/reports.service.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`src/server/services/reports.ts`:

- `loadIntervalsInRange`'s filter type (near line 60) currently `filter: { workerIds?: string[]; clientId?: string }`; change to `{ workerIds?: string[]; clientId?: string; jobIds?: string[] }` and in the `where` add `filter.jobIds ? inArray(schema.intervals.jobId, filter.jobIds) : undefined` (drizzle skips undefined in `and`).

- `loadPieces(deps, period, filter)` already forwards `filter` → no change.

- `JobRecon` type (line 56): `export type JobRecon = { jobId: string; jobName: string; projectName: string; clientName: string } & RoleRecon & { budgetCents?: number | null; consumedCents?: number; budgetPct?: number | null }`.

- `perJob(deps, ctx, input)`:

  In `jobRows` select, add `budgetCents: schema.jobs.budgetCents`.

  After building `keepCents` and before mapping, fetch all-time pieces for the same jobIds (wide window, demo scale fine):

```ts
  const keepCents = canSeeMoney(ctx)
  const allTimePieces: Piece[] = []
  if (keepCents && jobIds.length > 0) {
    const wide = await loadPieces(deps, { from: '2000-01-01', to: '2100-01-01' }, { jobIds })
    allTimePieces.push(...wide)
  }
```

  In the `.map((jobId) => { ... })`, after `const r = recon(byJob.get(jobId)!)` and `const base: JobRecon = { jobId, ...makeRecon(r, keepCents) }`:

```ts
      if (keepCents) {
        const budget = jobMap.get(jobId)!.budgetCents ?? null
        const consumed = recon(allTimePieces.filter((p) => p.jobId === jobId)).cents
        base.budgetCents = budget
        base.consumedCents = consumed
        base.budgetPct = budget != null && budget > 0 ? Math.round((consumed / budget) * 100) : null
      }
```

  Note: `jobMap.get(jobId)!` needs `budgetCents` in `jobMap`'s row type.

`src/routes/_app/reports.tsx`:

- `BillingPanel` props already carry `jobs`? The loader already loads `jobs` for both `recon` and `daily` branches. Wire them: extend `BillingPanel` props with `jobs?: JobRecon[]` and `BillingPanel` call sites already have `jobs` in scope (loader branch). Confirm Import Type for `JobRecon`.

- In `BillingPanel`, inside the `{sub === 'daily' && daily ? ... : null}` block, after the DailyTable section add:

```tsx
      {sub === 'daily' && jobs ? (
        <section className="card">
          <h2>By job</h2>
          <table className="recontable">
            <thead><tr><th className="nm">Job</th><th>Client</th><th>Figures</th><th>Budget</th><th>Consumed</th></tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.jobId}>
                  <td className="nm">{j.jobName}</td>
                  <td>{j.projectName} · {j.clientName}</td>
                  <td><TrioChip recon={j as import('~/lib/attribution').Recon} /></td>
                  <td className="money">{'budgetCents' in j && j.budgetCents != null ? formatCents(j.budgetCents) : '—'}</td>
                  <td className="money">
                    {'consumedCents' in j ? `${formatCents(j.consumedCents!)}${j.budgetPct != null ? ` (${j.budgetPct}%)` : ''}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
```

  Import `formatCents` from `~/lib/money`, `TrioChip` already imported.

  New copy (all in this task): 'By job', 'Budget', 'Consumed'.

- [ ] **Step 4: Verify + gate + commit**

Run: `npx vitest run tests/integration/reports.service.test.ts` → PASS. Run: `npm run check` → exit 0.

```bash
git add src/server/services/reports.ts src/routes/_app/reports.tsx tests/integration/reports.service.test.ts
git commit -m "feat: budget vs actual per job"
```

---

### Task B4: period-over-period deltas

**Files:**
- Modify: `src/routes/_app/reports.tsx` (loader + table columns)
- Test: (none required — loader/table change only; gate via `npm run check` + manual eyeball deferred)

**Interfaces:**
- No new service. Reuses `reconciliation` with two periods. Extends `BillingPanel` props with optional `prevRecon?: ReconciliationReport`.

- [ ] **Step 1: Wire the loader**

In `src/routes/_app/reports.tsx`, inside the `if (tab === 'billing' && ...)` branch, in the `recon` block (before the `if (sub === 'daily')` block):

Reuse `src/lib/dateShift.ts` (`parseIsoDate`, `toIsoDate`, `addDays`); do not add a local date helper:

```ts
import { addDays, parseIsoDate, toIsoDate } from '~/lib/dateShift'
const shiftIso = (iso: string, days: number) => toIsoDate(addDays(parseIsoDate(iso), days))
```

In the loader's default/`recon` branch (the catch-all AFTER the `daily`/`leave`/`trends` blocks that loads `recon` + `jobs`):

```ts
      // For period-over-period deltas: shift by the period length in days, inclusive.
      const len = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1
      const prevFrom = shiftIso(from, -len)
      const prevTo = shiftIso(to, -len)
      const [recon, jobs, prevRecon] = await Promise.all([
        reconciliationFn({ data: period }),
        perJobFn({ data: period }),
        reconciliationFn({ data: { from: prevFrom, to: prevTo } }),
      ])
      return { today: today.date, tz, ctx, tab, sub, from, to, recon, jobs, prevRecon }
```

  Extend `ReportsView`'s `data` type with `prevRecon?: ReconciliationReport` and `BillingPanel`'s props likewise.

  Note: `reconciliationFn` is already imported; `perJobFn` too. The existing `return { ..., recon, jobs }` becomes `...prevRecon`.

- [ ] **Step 2: Wire the table**

`src/components/reconTable.tsx` — extend the props to `function ReconTable({ report, prev }: { report: ReconciliationReport; prev?: ReconciliationReport })`. Keep backward compat: `prev` optional, default `undefined`.

After the existing `showMoney` logic, add:

```ts
  const showMoney = 'cents' in report.total
  const showDeltas = prev !== undefined
  const prevByClient = showDeltas ? new Map(prev!.clients.map((c) => [c.clientId, c])) : null
  const deltaText = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${formatHmm(Math.abs(n))}`
```

In `ReconTable`'s header (after the `Figures` th and before `$`):

```tsx
          {showDeltas ? <th className="money">Effort Δ</th> : null}
          {showDeltas ? <th className="money">Premium Δ</th> : null}
          {showMoney && showDeltas ? <th className="money">$ Δ</th> : null}
```

In the `tbody` row (`report.clients.map`):

```tsx
            {showDeltas
              ? (() => {
                  const p = prevByClient!.get(c.clientId)
                  const dEffort = c.effortMin - (p?.effortMin ?? 0)
                  const dPremium = c.premiumMin - (p?.premiumMin ?? 0)
                  return (
                    <>
                      <td className="money">{deltaText(dEffort)}</td>
                      <td className="money">{deltaText(dPremium)}</td>
                    </>
                  )
                })()
              : null}
            {showMoney && 'cents' in c && showDeltas
              ? (() => {
                  const p = prevByClient!.get(c.clientId) as ClientRecon | undefined
                  const pcs = p && 'cents' in p ? p.cents! : 0
                  const dc = c.cents - pcs
                  return <td className="money">{dc === 0 ? '—' : `${dc > 0 ? '+' : '-'}${formatCents(Math.abs(dc))}`}</td>
                })()
              : null}
```

  Note: `prev` rows missing for a client (new client this period) → `p` undefined → delta equals current.

  `BillingPanel` call: `<ReconTable report={recon} prev={prevRecon} />` (pass through — when on the `daily`/`leave` subtabs `prevRecon` is undefined and the deltas hide).

  New copy (all in this task): 'Effort Δ', 'Premium Δ', '$ Δ'.

- [ ] **Step 3: Verify + gate + commit**

Eyeball deferred (no browser). Run: `npm run check` → exit 0 (unit+integration pass; `reconTable` import compiles). The delta columns are visible only on the Totals subtab when `prevRecon` is present.

```bash
git add src/routes/_app/reports.tsx src/components/reconTable.tsx
git commit -m "feat: period over period deltas"
```

---

### Task C1: interval events in the audit timeline

**Files:**
- Modify: `src/server/services/approvals.ts`
- Modify: `src/components/approverView.tsx`
- Test: `tests/integration/approvals.service.test.ts` (new — extend with this task's cases)

**Interfaces:**
- Extends: `export type IntervalEventView = { id: string; kind: 'create' | 'edit' | 'delete'; at: Date; actorName: string; changes: Record<string, { from: unknown; to: unknown }> | null }`, `WeekForApproval.intervalEvents: IntervalEventView[]`. New internal label map `INTERVAL_EVENT_LABEL` additive to `EVENT_LABEL` (both together render the merged timeline).

- [ ] **Step 1: Write the failing tests**

Create (or extend, if already present — none exists; create) `tests/integration/approvals.service.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { db, resetDb, deps, asUser, at, ids } from './helpers'
import { createInterval, updateInterval } from '~/server/services/intervals'
import { getWeekForApproval } from '~/server/services/approvals'
import { schema } from '~/server/db'

beforeEach(async () => {
  await resetDb()
  await db.delete(schema.leaveEvents).all()
  await db.delete(schema.leaveRequests).all()
})

afterAll(async () => {
  await resetDb()
})

// opWorker's seeded j1 intervals sit on day 0 (09–12 UTC) and day 2; day 4 (Sat, still
// week 2026-08-31 in Perth) is clear of SAME_JOB_OVERLAP.
describe('audit timeline (interval events)', () => {
  it('week view merges interval events into the audit data', async () => {
    const iv = await createInterval(deps(), asUser('operator'), {
      workerId: ids.opWorker, jobId: ids.j1,
      startedAt: at(4, 8).toISOString(), endedAt: at(4, 12).toISOString(),
    })
    await updateInterval(deps(), asUser('operator'), { id: iv.id, note: 'focus' })
    const week = await getWeekForApproval(deps(), asUser('billing'), { workerId: ids.opWorker, weekStart: '2026-08-31' })
    const kinds = week.intervalEvents.map((e) => e.kind)
    expect(kinds).toEqual(expect.arrayContaining(['create', 'edit']))
    const edit = week.intervalEvents.find((e) => e.kind === 'edit')!
    expect(edit.actorName).toBe('Demo Operator')
    expect((edit.changes!.note as { from: unknown }).from).toBeNull()
  })

  it('operators never receive the rateCents diff (#5)', async () => {
    const iv = await createInterval(deps(), asUser('operator'), {
      workerId: ids.opWorker, jobId: ids.j1,
      startedAt: at(4, 8).toISOString(), endedAt: at(4, 12).toISOString(),
    })
    // Move to a job whose rate differs (billable→non-billable): rateCents appears only for billing.
    await updateInterval(deps(), asUser('admin'), { id: iv.id, jobId: ids.j4 })
    const billingView = await getWeekForApproval(deps(), asUser('billing'), { workerId: ids.opWorker, weekStart: '2026-08-31' })
    const opsView = await getWeekForApproval(deps(), asUser('operator'), { workerId: ids.opWorker, weekStart: '2026-08-31' })
    const bHas = billingView.intervalEvents.some((e) => e.changes && 'rateCents' in e.changes)
    const oHas = opsView.intervalEvents.some((e) => e.changes && 'rateCents' in e.changes)
    expect(bHas).toBe(true)
    expect(oHas).toBe(false)
    // jobId diff is kept for both (not money).
    expect(billingView.intervalEvents.find((e) => e.kind === 'edit')!.changes).toHaveProperty('jobId')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/integration/approvals.service.test.ts` → FAIL.

- [ ] **Step 3: Implement**

In `src/server/services/approvals.ts`, add to imports: `asc` and `sql` from `drizzle-orm` if not present; `getOrgSettings` already imported in this file by A2 (for `flagsCfg`); `inArray` is already imported.

Near the `WeekForApproval`/`MyWeek` types, add:

```ts
export type IntervalEventView = {
  id: string
  kind: 'create' | 'edit' | 'delete'
  at: Date
  actorName: string
  changes: Record<string, { from: unknown; to: unknown }> | null
}
```

and extend `WeekForApproval` with `intervalEvents: IntervalEventView[]`.

In `getWeekForApproval`, after the approval `events` array is built and before the return, add:

```ts
  // Merge interval events for this week's intervals into the audit data.
  const intervalEventViews: IntervalEventView[] = []
  if (intervals.length > 0) {
    const idList = intervals.map((i) => i.id)
    const rawIe = await db
      .select()
      .from(schema.intervalEvents)
      .where(inArray(schema.intervalEvents.intervalId, idList))
      .orderBy(asc(schema.intervalEvents.at), sql`rowid`) // rowid breaks same-instant ties
      .all()
    if (rawIe.length > 0) {
      const actors = await workerNames(db, rawIe.map((e) => e.actorWorkerId))
      for (const e of rawIe) {
        // #5: rateCents is money — strip the diff for non-money viewers.
        let changes: IntervalEventView['changes'] = e.changes ? (JSON.parse(e.changes) as IntervalEventView['changes']) : null
        if (changes && !keepCents) {
          const { rateCents: _drop, ...rest } = changes
          changes = rest as IntervalEventView['changes']
        }
        intervalEventViews.push({ id: e.id, kind: e.kind, at: e.at, actorName: actors.get(e.actorWorkerId) ?? '?', changes })
      }
    }
  }
```

and in the returned literal add `intervalEvents: intervalEventViews,`.

`src/components/approverView.tsx`:

At the top, after `EVENT_LABEL`, add:

```ts
const INTERVAL_EVENT_LABEL: Record<IntervalEventView['kind'], string> = {
  create: 'Entry created',
  edit: 'Entry edited',
  delete: 'Entry deleted',
}
```

and helpers (module scope, after `INTERVAL_EVENT_LABEL`):

```ts
function changesText(changes: Record<string, { from: unknown; to: unknown }>): string {
  const short = (v: unknown) => {
    if (v == null) return '(none)'
    const s = String(v)
    return s.length > 30 ? `${s.slice(0, 30)}…` : s === '' ? '(blank)' : s
  }
  return Object.entries(changes)
    .map(([k, { from: f, to: t }]) => `${k}: ${short(f)} → ${short(t)}`)
    .join('; ')
}
```

In the template, replace the Audit trail section's `{week.events.map(...)}` with a merged trail:

```tsx
      {(() => {
        const trail: { key: string; at: Date; kind: string; actor: string; detail: string | null }[] = [
          ...week.events.map((e) => ({ key: e.id, at: e.at, kind: EVENT_LABEL[e.kind] ?? e.kind, actor: e.actorName, detail: e.reason ?? null })),
          ...week.intervalEvents.map((e) => ({
            key: e.id,
            at: e.at,
            kind: INTERVAL_EVENT_LABEL[e.kind],
            actor: e.actorName,
            detail: e.changes ? changesText(e.changes) : null,
          })),
        ].sort((a, b) => b.at.getTime() - a.at.getTime()) // stable sort: same-instant rows keep approval-then-interval order
        if (trail.length === 0)
          return <div className="lanebody-empty">No events yet.</div>
        return (
          <ol className="audit-trail">
            {trail.map((t) => (
              <li key={t.key}>
                <span className="audit-at">{localDateTimeOf(t.at.getTime(), tz)}</span>
                <span className="audit-kind">{t.kind}</span>
                <span className="audit-actor">{t.actor}</span>
                {t.detail ? <span className="audit-reason">— {t.detail}</span> : null}
              </li>
            ))}
          </ol>
        )
      })()}
```

Add the import for type `IntervalEventView`: `import type { WeekForApproval, IntervalEventView } from '~/server/services/approvals'` (or a type-only import of `IntervalEventView`).

Also add `import type { IntervalEventView }` to the `INTERVAL_EVENT_LABEL`'s callers (the label map is typed).

New copy: 'Entry created', 'Entry edited', 'Entry deleted'.

- [ ] **Step 4: Verify + gate + commit**

Run: `npx vitest run tests/integration/approvals.service.test.ts` → PASS. Run: `npm run check` → exit 0.

```bash
git add src/server/services/approvals.ts src/components/approverView.tsx tests/integration/approvals.service.test.ts
git commit -m "feat: interval events in audit timeline"
```

---

### Task C2: rate column in week audit

**Files:**
- Modify: `src/server/services/approvals.ts` (`WeekIntervalAudit` + push)
- Modify: `src/components/approverView.tsx` (Rate column)
- Test: `tests/integration/approvals.service.test.ts` (append — reuses C1's file)

**Interfaces:**
- Extends: `WeekIntervalAudit` with optional `rateCents?: number | null` (omit-key for non-money viewers, `#5`; `null` = non-billable job for money viewers). UI gates the column on `'rateCents' in row`.

- [ ] **Step 1: Failing tests**

Append to the same `tests/integration/approvals.service.test.ts`:

```ts
it('interval audit rows carry the rate only for money viewers', async () => {
  const iv = await createInterval(deps(), asUser('operator'), {
    workerId: ids.opWorker, jobId: ids.j1,
    startedAt: at(4, 8).toISOString(), endedAt: at(4, 9).toISOString(),
  })
  const week = { workerId: ids.opWorker, weekStart: '2026-08-31' }
  const billingView = await getWeekForApproval(deps(), asUser('billing'), week)
  const billingRow = billingView.intervals.find((r) => r.id === iv.id)!
  expect(billingRow.rateCents).toBe(12_000) // position posSenior overrides j1's 14_000
  expect(billingView.intervals.every((r) => 'rateCents' in r)).toBe(true) // seeded rows too
  // Operators viewing their own week via the read-only ApproverView path get no rate key (#5).
  const opsView = await getWeekForApproval(deps(), asUser('operator'), week)
  expect(opsView.intervals.some((r) => 'rateCents' in r)).toBe(false)
})
```

Note: the week already holds seeded opWorker rows, so look rows up by id rather than `[0]`. Self-view via `operator` is permitted by `assertCanViewWorker` (self); billing viewers pass via the role.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/integration/approvals.service.test.ts` → FAIL.

- [ ] **Step 3: Implement**

In `src/server/services/approvals.ts`, `WeekIntervalAudit` type: add `rateCents?: number` (after `editCount`).

In `getWeekForApproval`'s `intervalsAudit.push({ ... })` block use a conditional spread. Do NOT write `rateCents: keepCents ? … : undefined` — an explicit `undefined` still creates the key and `'rateCents' in row` becomes true for operators (#5):

```ts
        const row: WeekIntervalAudit = {
          id: i.id,
          jobName: i.jobName,
          clientName: i.clientName,
          startedAt: i.startedAt,
          endedAt: i.endedAt,
          minutes: ...,
          createdByName: creators.get(i.createdBy) ?? '?',
          createdAt: i.createdAt,
          editCount: i.editCount,
          ...(keepCents ? { rateCents: i.rateCents } : {}),
        }
        intervalsAudit.push(row)
```

`WeekIntervalAudit.rateCents?: number | null` — a billing viewer sees `null` for a non-billable job (that is information, not a placeholder); the key is absent only for non-money viewers. Adjust the existing minutes/clip block accordingly; keep the wall-clock clip comment (#H4). In the UI cell, render `null` as `—`.

`src/components/approverView.tsx`:

- Import `formatCents` from `~/lib/money` if missing.
- Near the top of the component, inside `ApproverView`: `const showRate = week.intervals.some((iv) => 'rateCents' in iv)`.

- In `<thead><tr>`: add `{showRate ? <th>Rate</th> : null}` after `<th>Edits</th>`.

- In `<tbody>` row:

```tsx
                    {showRate ? (
                      <td className="mono">{iv.rateCents == null ? '—' : `${formatCents(iv.rateCents)}/h`}</td>
                    ) : null}
```

  Header new copy: 'Rate'. Cell suffix '/h' (new copy). `formatCents` produces `$140.00`; the cell shows `$140.00/h`.

- [ ] **Step 4: Verify + gate + commit**

Run: `npx vitest run tests/integration/approvals.service.test.ts` → PASS. Run: `npm run check` → exit 0.

```bash
git add src/server/services/approvals.ts src/components/approverView.tsx tests/integration/approvals.service.test.ts
git commit -m "feat: rate column in week audit"
```

---

### Task C3: supervisor team view

**Files:**
- Modify: `src/server/services/approvals.ts` (add `listTeamWeeks` — reuses `getOrgSettings`/`flagsCfg`/`weekDatesOf` already in this file)
- Modify: `src/server/fns/approvals.ts` (add `listTeamWeeksFn`)
- Create: `src/routes/_app/team.tsx`
- Modify: `src/routes/_app/route.tsx` (nav link)
- Test: `tests/integration/approvals.service.test.ts` (append)

**Interfaces:**
- Produces: `export type TeamMember = { workerId: string; workerName: string; weeks: TeamWeekRow[] }`, `export type TeamWeekRow = { weekStart: string; status: ApprovalStatus | 'none'; wallClockMin: number; effortMin: number; flagCount: number }`, `export async function listTeamWeeks(deps, ctx, input: ListMyWeeksInput): Promise<TeamMember[]>`, `export const listTeamWeeksFn`.

- [ ] **Step 1: Failing tests**

Append to `tests/integration/approvals.service.test.ts`:

```ts
import { listTeamWeeks } from '~/server/services/approvals'

it('team view lists supervisee weeks', async () => {
  const team = await listTeamWeeks(deps(), asUser('operator'), { weeks: 4 })
  expect(team.map((m) => m.workerName).sort()).toEqual(['Atlas', 'Beacon'])
  expect(team[0]!.weeks).toHaveLength(4)
  expect(team[0]!.weeks.every((w) => w.status === 'none')).toBe(true)
  expect(team[0]!.weeks.every((w) => typeof w.flagCount === 'number')).toBe(true)
})

it('team view is empty for non-supervisors', async () => {
  expect(await listTeamWeeks(deps(), asUser('billing'), { weeks: 4 })).toEqual([])
})
```

Note: `asUser('operator')` → `opWorker` supervises Atlas/Beacon (demo fixture). Billing has no supervisees.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/integration/approvals.service.test.ts` → FAIL.

- [ ] **Step 3: Implement**

In `src/server/services/approvals.ts`, after `listMyWeeks`, add:

```ts
export type TeamWeekRow = {
  weekStart: string
  status: ApprovalStatus | 'none'
  wallClockMin: number
  effortMin: number
  flagCount: number
}
export type TeamMember = { workerId: string; workerName: string; weeks: TeamWeekRow[] }

/* Supervisor's team dashboard: each supervisee's last N weeks with statuses,
   wall/effort and flag counts. Supervisees come from the session context (#12).
   No role guard — empty team renders the empty state. */
export async function listTeamWeeks(
  deps: Deps,
  ctx: SessionContext,
  input: z.infer<typeof ListMyWeeksInput>,
): Promise<TeamMember[]> {
  const { db, tz } = deps
  const superviseeIds = ctx.superviseeWorkerIds
  if (superviseeIds.length === 0) return []
  const names = await workerNames(db, superviseeIds)
  const cfg = flagsCfg(await getOrgSettings(deps, ctx))
  const weekStarts = weekDatesOf(tz, input.weeks, deps.now())
  const out: TeamMember[] = []
  for (const workerId of superviseeIds) {
    const weeks: TeamWeekRow[] = []
    for (const ws of weekStarts) {
      // sequential per week keeps DB handling simple at demo scale (no-await-in-loop is not enabled in this repo)
      const row = await loadApprovalRow(db, workerId, ws)
      const intervals = await loadIntervalsForWeek(db, workerId, ws, tz)
      const pieces = toPieces(intervals, ws, tz)
      const r = piecesRecon(pieces)
      const supervisors = await workerSupervisors(db, [workerId])
      const flagInput = {
        weekStart: ws,
        tz,
        worker: { id: workerId, supervisorId: supervisors.get(workerId) ?? null },
        intervals: toIntervalsForRedFlags(intervals),
        pieces,
      }
      const flags = redFlags(flagInput, cfg)
      weeks.push({ weekStart: ws, status: row?.status ?? 'none', wallClockMin: r.wallClockMin, effortMin: r.effortMin, flagCount: flags.length })
    }
    out.push({ workerId, workerName: names.get(workerId) ?? '?', weeks })
  }
  return out
}
```

Requires imports already in this file: `z` from `zod` (for infer); `ListMyWeeksInput` from `~/lib/schemas/approvals` (for the type); `localDayBoundariesUtcMs` not needed here; keep `weekDatesOf` as a local helper (already exists after `listMyWeeks`).

`src/server/fns/approvals.ts` — add (after `listMyWeeksFn`):

```ts
import { ListMyWeeksInput } from '~/lib/schemas/approvals'
import { listTeamWeeks } from '~/server/services/approvals'

export const listTeamWeeksFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(ListMyWeeksInput)
  .handler(({ data, context }) => listTeamWeeks(runtimeDeps(), ctxOf(context), data))

export type { TeamMember, TeamWeekRow } from '~/server/services/approvals'
```

`src/routes/_app/team.tsx` (new):

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { Users } from 'reicon-react'
import { StatusChip } from '~/components/ui/chip'
import { STATUS_LABEL } from '~/components/weekStatus'
import { formatWeekLabel } from '~/lib/dayMath'
import { formatHmm } from '~/lib/money'
import { listTeamWeeksFn } from '~/server/fns/approvals'
import type { TeamMember } from '~/server/services/approvals'

const badgeKind: Record<TeamMember['weeks'][number]['status'], 'solid' | 'outline' | 'inverse' | 'error'> = {
  none: 'outline',
  draft: 'outline',
  submitted: 'inverse',
  approved: 'solid',
  rejected: 'error',
}

export const Route = createFileRoute('/_app/team')({
  loader: () => listTeamWeeksFn({ data: { weeks: 4 } }),
  component: TeamPage,
})

function TeamPage() {
  const team = Route.useLoaderData() as TeamMember[]
  if (team.length === 0) {
    return (
      <main className="leave">
        <h1><Users size={18} /> Team</h1>
        <p className="tree-empty">No team members yet.</p>
      </main>
    )
  }
  return (
    <main className="leave">
      <h1><Users size={18} /> Team</h1>
      {team.map((m) => (
        <section key={m.workerId} className="card">
          <h2 className="today-section-title">{m.workerName}</h2>
          <table className="intervallist">
            <thead>
              <tr>
                <th>Week</th>
                <th>Status</th>
                <th>Wall clock</th>
                <th>Effort</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {m.weeks.map((w) => (
                <tr key={w.weekStart}>
                  <td className="mono">{formatWeekLabel(w.weekStart)}</td>
                  <td><StatusChip kind={badgeKind[w.status]}>{STATUS_LABEL[w.status]}</StatusChip></td>
                  <td className="mono">{formatHmm(w.wallClockMin)}</td>
                  <td className="mono">{formatHmm(w.effortMin)}</td>
                  <td className="mono">{w.flagCount > 0 ? `⚑ ${w.flagCount}` : 'no flags'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </main>
  )
}
```

`Users` in `reicon-react` is unverified (the package was not installed when this plan was reviewed). If it is not exported, use `Briefcase` instead; check with `grep -c "Users" node_modules/reicon-react/dist/index.d.ts` before writing the route.

`src/routes/_app/route.tsx` — import `Users` (or fallback) and add after the Leave link:

```tsx
        <Link to="/team" activeProps={{ className: 'active' }}>
          <Users size={15} /> Team
        </Link>
```

New copy: 'Team', 'No team members yet.', 'Wall clock', 'Flags', 'no flags' (the last three reuse existing copy; only 'No team members yet.' is new).

- [ ] **Step 4: Regenerate route tree, verify + gate + commit**

`npm run check` runs `tsc` and `createFileRoute('/_app/team')` does not typecheck until the Start plugin has regenerated `src/routeTree.gen.ts`, so build FIRST:

```bash
npm run build
```

Then run: `npx vitest run tests/integration/approvals.service.test.ts` → PASS. Run: `npm run check` → exit 0.

```bash
git add src/server/services/approvals.ts src/server/fns/approvals.ts src/routes/_app/team.tsx src/routes/_app/route.tsx src/routeTree.gen.ts tests/integration/approvals.service.test.ts
git commit -m "feat: supervisor team view"
```

---

### Task C4: exception-based review + bulk approve

**Files:**
- Modify: `src/lib/schemas/approvals.ts` (add `BulkApproveInput`)
- Modify: `src/server/services/approvals.ts` (add `approveWeeksBulk`)
- Modify: `src/server/fns/approvals.ts` (add `approveWeeksBulkFn`)
- Modify: `src/components/approvalsQueue.tsx` (checkbox + flex row)
- Modify: `src/routes/_app/approvals.tsx` (filters + bulk button)
- Modify: `src/styles/global.css` (queue-row flex + button flex)
- Test: `tests/integration/approvals.service.test.ts` (append)

**Interfaces:**
- Produces: `export const BulkApproveInput = z.object({ weeks: z.array(WeekTarget).min(1).max(50), comment: z.string().max(500).optional() })`, `export type BulkApproveInput`, `export type BulkApproveResult = { workerId: string; weekStart: string; ok: boolean; code?: string }`, `export async function approveWeeksBulk(deps, ctx, input: BulkApproveInput): Promise<BulkApproveResult[]>`, `export const approveWeeksBulkFn`.

- [ ] **Step 1: Schema**

In `src/lib/schemas/approvals.ts`, after the existing inputs:

```ts
export const BulkApproveInput = z.object({
  weeks: z.array(WeekTarget).min(1).max(50),
  comment: z.string().max(500).optional(),
})
export type BulkApproveInput = z.infer<typeof BulkApproveInput>
```

Note: `WeekTarget` is already declared in this file (`z.object({ workerId, weekStart })`). If it is not exported, export it or define `BulkApproveInput` inline with `z.object({ workerId: z.string().min(1), weekStart: z.string().regex(...) }).min(1).max(50)` — keep `WeekTarget`'s exact shape.

- [ ] **Step 2: Failing tests**

Append to `tests/integration/approvals.service.test.ts`:

```ts
import { approveWeeksBulk, submitWeek } from '~/server/services/approvals'

it('bulk approve handles each week independently', async () => {
  await submitWeek(deps(), asUser('operator'), { workerId: ids.opWorker, weekStart: '2026-08-31' })
  await submitWeek(deps(), asUser('billing'), { workerId: ids.billingWorker, weekStart: '2026-08-31' })
  const res = await approveWeeksBulk(deps(), asUser('billing'), {
    weeks: [
      { workerId: ids.opWorker, weekStart: '2026-08-31' },
      { workerId: ids.billingWorker, weekStart: '2026-08-31' },
    ],
  })
  expect(res.find((r) => r.workerId === ids.opWorker)!.ok).toBe(true)
  expect(res.find((r) => r.workerId === ids.billingWorker)).toMatchObject({ ok: false, code: 'SELF_APPROVAL' })

  // Already approved → INVALID_TRANSITION per row, without breaking the batch.
  const again = await approveWeeksBulk(deps(), asUser('billing'), {
    weeks: [{ workerId: ids.opWorker, weekStart: '2026-08-31' }],
  })
  expect(again[0]).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' })

  await expect(
    approveWeeksBulk(deps(), asUser('operator'), { weeks: [{ workerId: ids.opWorker, weekStart: '2026-08-31' }] }),
  ).rejects.toMatchObject({ status: 403 })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/integration/approvals.service.test.ts` → FAIL.

- [ ] **Step 4: Implement**

In `src/server/services/approvals.ts`, after `approveWeek`, add:

```ts
export type BulkApproveResult = { workerId: string; weekStart: string; ok: boolean; code?: string }

/* Bulk approve: per-week optimistic guards run individually so one locked or
   self-approval week never blocks the rest (#M6 shape). */
export async function approveWeeksBulk(
  deps: Deps,
  ctx: SessionContext,
  input: z.infer<typeof BulkApproveInput>,
): Promise<BulkApproveResult[]> {
  if (!hasRole(ctx, 'billing')) throw new HttpError(403, 'FORBIDDEN')
  const out: BulkApproveResult[] = []
  for (const w of input.weeks) {
    try {
      // approveWeek re-checks hasRole/self-approval/status guards — reuse it; per-row result capture is the design.
      await approveWeek(deps, ctx, { ...w, comment: input.comment })
      out.push({ ...w, ok: true })
    } catch (e) {
      if (e instanceof HttpError) out.push({ ...w, ok: false, code: e.code })
      else throw e
    }
  }
  return out
}
```

Import `BulkApproveInput` from `~/lib/schemas/approvals` and `HttpError` if not already imported (it is — used in `approveWeek`).

`src/server/fns/approvals.ts` — add (this file imports the schema module and `* as svc`; follow that). Approvals fns gate with `authMw` only, the service enforces billing (see `approveWeekFn`):

```ts
export const approveWeeksBulkFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(BulkApproveInput)
  .handler(({ data, context }) => svc.approveWeeksBulk(runtimeDeps(), ctxOf(context), data))

export type { BulkApproveResult } from '~/server/services/approvals'
```

`src/components/approvalsQueue.tsx`:

Extend props:

```ts
export function ApprovalsQueue({
  weeks,
  selected,
  onSelect,
  checked,
  onToggle,
}: {
  weeks: PendingWeek[]
  selected?: { workerId: string; weekStart: string }
  onSelect: (w: { workerId: string; weekStart: string }) => void
  checked?: Record<string, boolean>
  onToggle?: (key: { workerId: string; weekStart: string }) => void
}) {
```

In `weeks.map`, before the `<button>` add:

```tsx
            {onToggle ? (
              <input
                type="checkbox"
                checked={checked?.[`${w.workerId}-${w.weekStart}`] ?? false}
                aria-label={`Select ${w.workerName} week ${w.weekStart}`}
                onChange={() => onToggle({ workerId: w.workerId, weekStart: w.weekStart })}
                style={{ flex: '0 0 auto' }}
              />
            ) : null}
```

`src/styles/global.css` — add after the `.approvalsqueue li button` block:

```css
.approvalsqueue li { display: flex; align-items: center; gap: var(--space-2); }
.approvalsqueue li > button { flex: 1; }
```

`src/routes/_app/approvals.tsx`:

- Imports: `useState` from `react`, `Button` from `~/components/ui/button`, `approveWeeksBulkFn` from `~/server/fns/approvals` (alongside existing `listPendingWeeksFn` etc.), `serverErrorMessage` from `~/components/forms/applyServerError`.

- Hooks go at the top of `ApprovalsView`, directly after the existing `router`/`invalidate` lines and BEFORE the `if (!data.ctx)` early return. Never inside the `if (data.mode === 'approver')` branch (conditional hooks):

```tsx
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [bulkError, setBulkError] = useState('')
```

- Filtered queue, inside the approver branch:

```ts
  const queue: PendingWeek[] = data.queue.filter((w) => !flaggedOnly || w.flagCount > 0)
```

  In the approver branch template, in the `approvals-queue-pane` before `ApprovalsQueue` add:

```tsx
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
              <label className="checkline">
                <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
                Only weeks with flags
              </label>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={Object.values(checked).filter(Boolean).length === 0}
                onClick={async () => {
                  setBulkError('')
                  const weeks = queue
                    .filter((w) => checked[`${w.workerId}-${w.weekStart}`])
                    .map((w) => ({ workerId: w.workerId, weekStart: w.weekStart }))
                  try {
                    await approveWeeksBulkFn({ data: { weeks } })
                    setChecked({})
                    await invalidate()
                  } catch (e) {
                    setBulkError(serverErrorMessage(e))
                  }
                }}
              >
                Approve selected
              </Button>
            </div>
            {bulkError && <span className="field-error" role="alert">{bulkError}</span>}
```

  Pass through: `<ApprovalsQueue weeks={queue} selected={data.selected ?? undefined} onSelect={...} checked={checked} onToggle={(k) => setChecked((prev) => ({ ...prev, [`${k.workerId}-${k.weekStart}`]: !prev[`${k.workerId}-${k.weekStart}`] }))} />`.

  New copy: 'Only weeks with flags', 'Approve selected'.

- [ ] **Step 5: Verify + gate + commit**

Run: `npx vitest run tests/integration/approvals.service.test.ts` → PASS. Run: `npm run check` → exit 0.

```bash
git add src/lib/schemas/approvals.ts src/server/services/approvals.ts src/server/fns/approvals.ts src/components/approvalsQueue.tsx src/routes/_app/approvals.tsx src/styles/global.css tests/integration/approvals.service.test.ts
git commit -m "feat: bulk approve and flags-only filter"
```

---

### Task C5: audit-log CSV export

**Files:**
- Modify: `src/lib/schemas/reports.ts` (`ExportCsvInput` view enum)
- Modify: `src/server/services/exports.ts` (add `EVENTS_CSV_COLUMNS` + `events` branch)
- Modify: `src/routes/_app/approvals.tsx` (Export audit log button)
- Test: `tests/integration/exports.service.test.ts` (append)

**Interfaces:**
- Consumes: `approvalEvents`/`leaveEvents`/`intervalEvents` tables, `periodRange` via `localDayBoundariesUtcMs`, `localDateTimeOf` for display, `canSeeMoney` gate (billing/admin only — interval diffs are money).
- Produces: CSV view `'events'` via `exportCsv(deps, ctx, { from, to, view: 'events' }): Promise<{ filename, body }>`; routed through existing `exportCsvFn` (the validator follows the schema, so the dispatch `if (input.view === 'events')` is in the service).

- [ ] **Step 1: Schema**

In `src/lib/schemas/reports.ts`:

```ts
export const ExportCsvInput = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  view: z.enum(['intervals', 'daily', 'leave', 'events']),
})
```

- [ ] **Step 2: Failing tests**

Append to `tests/integration/exports.service.test.ts`:

```ts
import { exportCsv } from '~/server/services/exports'
import { submitWeek } from '~/server/services/approvals'

it('audit CSV exports approval, leave and interval events for billing', async () => {
  await submitWeek(deps(), asUser('operator'), { workerId: ids.opWorker, weekStart: '2026-08-31' })
  const res = await exportCsv(deps(), asUser('billing'), { from: '2000-01-01', to: '2100-01-01', view: 'events' })
  expect(res.body.split('\n')[0]).toBe('at,kind,worker,subject,actor,detail')
  expect(res.body).toContain('submit')
  expect(res.body).toContain('Demo Operator')
  expect(res.body).toContain('leave_approve') // seeded leave request lr-demo-1's event
  expect(res.filename).toContain('events')
})

it('audit CSV is billing-only', async () => {
  await expect(
    exportCsv(deps(), asUser('operator'), { from: '2000-01-01', to: '2100-01-01', view: 'events' }),
  ).rejects.toMatchObject({ status: 403 })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/integration/exports.service.test.ts` → FAIL.

- [ ] **Step 4: Implement**

`src/server/services/exports.ts`:

Add imports: `localDateOf` and `localDateTimeOf` from `~/lib/dayMath` (keep `localDayBoundariesUtcMs`); add `gte` to the `drizzle-orm` import (`and`, `eq`, `lt`, `inArray` are already there). Reuse the file's existing `workerNamesForBilling(db)` for display names — do not add a second name lookup.

After `DAILY_CSV_COLUMNS`, add:

```ts
export const EVENTS_CSV_COLUMNS = ['at', 'kind', 'worker', 'subject', 'actor', 'detail'] as const
```

Inside `exportCsv(deps, ctx, input)` dispatch (before the daily fallthrough), add:

```ts
  if (input.view === 'events') {
    if (!canSeeMoney(ctx)) throw new HttpError(403, 'FORBIDDEN')
    const tz = deps.tz
    const startMs = localDayBoundariesUtcMs(input.from, tz).startMs
    const endMs = localDayBoundariesUtcMs(input.to, tz).endMs

    const approvalRows = await db
      .select({
        kind: schema.approvalEvents.kind,
        at: schema.approvalEvents.at,
        actorWorkerId: schema.approvalEvents.actorWorkerId,
        reason: schema.approvalEvents.reason,
        workerId: schema.approvals.workerId,
        weekStart: schema.approvals.weekStart,
      })
      .from(schema.approvalEvents)
      .innerJoin(schema.approvals, eq(schema.approvals.id, schema.approvalEvents.approvalId))
      .where(and(gte(schema.approvalEvents.at, new Date(startMs)), lt(schema.approvalEvents.at, new Date(endMs))))
      .all()

    const leaveRows = await db
      .select({
        kind: schema.leaveEvents.kind,
        at: schema.leaveEvents.at,
        actorWorkerId: schema.leaveEvents.actorWorkerId,
        reason: schema.leaveEvents.reason,
        workerId: schema.leaveRequests.workerId,
        typeName: schema.leaveTypes.name,
        startDay: schema.leaveRequests.startDay,
        endDay: schema.leaveRequests.endDay,
      })
      .from(schema.leaveEvents)
      .innerJoin(schema.leaveRequests, eq(schema.leaveRequests.id, schema.leaveEvents.requestId))
      .innerJoin(schema.leaveTypes, eq(schema.leaveTypes.id, schema.leaveRequests.typeId))
      .where(and(gte(schema.leaveEvents.at, new Date(startMs)), lt(schema.leaveEvents.at, new Date(endMs))))
      .all()

    const intervalRows = await db
      .select({
        kind: schema.intervalEvents.kind,
        at: schema.intervalEvents.at,
        actorWorkerId: schema.intervalEvents.actorWorkerId,
        intervalId: schema.intervalEvents.intervalId,
        changes: schema.intervalEvents.changes,
        workerId: schema.intervals.workerId,
        jobName: schema.jobs.name,
        startedAt: schema.intervals.startedAt,
      })
      .from(schema.intervalEvents)
      .innerJoin(schema.intervals, eq(schema.intervals.id, schema.intervalEvents.intervalId))
      .innerJoin(schema.jobs, eq(schema.jobs.id, schema.intervals.jobId))
      .where(and(gte(schema.intervalEvents.at, new Date(startMs)), lt(schema.intervalEvents.at, new Date(endMs))))
      .all()

    // `wnames` (workerNamesForBilling) is already loaded at the top of exportCsv and covers every worker.
    const nameOf = (id: string) => wnames.get(id)?.name ?? '?'

    type Row = { at: Date; kind: string; workerId: string; actorId: string; subject: string; detail: string }
    const all: Row[] = [
      ...approvalRows.map((r) => ({
        at: r.at, kind: r.kind, workerId: r.workerId, actorId: r.actorWorkerId,
        subject: `week ${r.weekStart}`, detail: r.reason ?? '',
      })),
      ...leaveRows.map((r) => ({
        at: r.at, kind: `leave_${r.kind}`, workerId: r.workerId, actorId: r.actorWorkerId,
        subject: `${r.typeName} ${r.startDay}→${r.endDay}`, detail: r.reason ?? '',
      })),
      ...intervalRows.map((r) => ({
        at: r.at, kind: `interval_${r.kind}`, workerId: r.workerId, actorId: r.actorWorkerId,
        subject: `${r.jobName} ${localDateOf(r.startedAt.getTime(), tz)}`, detail: r.changes ?? '',
      })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime())

    const filename = `timesheets-${input.from}_${input.to}-events.csv`
    const out: string[] = [csvRow(EVENTS_CSV_COLUMNS as unknown as string[])]
    for (const r of all) {
      out.push(
        csvRow([
          localDateTimeOf(r.at.getTime(), tz),
          r.kind,
          nameOf(r.workerId),
          r.subject,
          nameOf(r.actorId),
          r.detail,
        ]),
      )
    }
    return { filename, body: out.join('\n') + '\n' }
  }
```

`src/routes/_app/approvals.tsx` (approver branch) — add near the other imports: `Button` (already imported by C4), `FileDownload` from `reicon-react`, `exportCsvFn` from `~/server/fns/exports`, and `addDays`, `parseIsoDate`, `toIsoDate` from `~/lib/dateShift` (no local date helper). In the approver loader branch add `today: today.date` to the returned object (`today` is already fetched there) and add `today: string` to the approver member of the `data` union type in `ApprovalsView`. No `@ts-expect-error`: once the type carries `today` there is no error, and an unused directive fails `tsc`.

In the `if (data.mode === 'approver')` JSX template, inside `approvals-head` after the count:

```tsx
          <span style={{ marginLeft: 'auto' }} />
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={async () => {
              const to = data.today
              const from = toIsoDate(addDays(parseIsoDate(to), -90))
              const res = await exportCsvFn({ data: { from, to, view: 'events' } })
              const blob = await res.blob()
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              const disp = res.headers.get('content-disposition') ?? ''
              const m2 = /filename="([^"]+)"/.exec(disp)
              a.download = m2?.[1] ?? `timesheets-${from}_${to}-events.csv`
              document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
            }}
          >
            <FileDownload size={13} /> Export audit log
          </Button>
```

New copy: 'Export audit log'.

- [ ] **Step 5: Verify + gate + commit**

Run: `npx vitest run tests/integration/exports.service.test.ts` → PASS. Run: `npm run check` → exit 0.

```bash
git add src/lib/schemas/reports.ts src/server/services/exports.ts src/routes/_app/approvals.tsx tests/integration/exports.service.test.ts
git commit -m "feat: audit log csv export"
```

---

### Task D1: docs + final gate

**Files:**
- Modify: `CLAUDE.md` (add to the "Where things are" table — after the Positions rows)
- Test: (none required — final gate)

- [ ] **Step 1: Update CLAUDE.md**

In the "Where things are" table, after the two Positions rows, add:

```markdown
| Interval edit events | `drizzle/schema.ts` `intervalEvents`, emitted in `src/server/services/intervals.ts` |
| Flag thresholds / trends / realization / budgets | `src/server/services/{settings,reports,structure}.ts` |
| Team view | `src/routes/_app/team.tsx`, `listTeamWeeks` in `src/server/services/approvals.ts` |
```

- [ ] **Step 2: Gate + build**

Run:

```bash
npm run check
npm run test:contract
npm run build
```

All must exit 0. Confirm `src/routeTree.gen.ts` has not churned beyond the C3 addition (re-run `npm run build` should leave it clean if it was already committed).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore: audit and reporting wrap-up"
```

---

## Done Criteria

- Interval event table exists, is appended on create/edit/delete, resets cleanly (`resetDb` deletes `intervalEvents` before `intervals`), and is surfaced in the audit timeline and the audit CSV.
- Flag thresholds are configurable via settings and drive `redFlags`; the gap detail templates `(< Nh)` via `gapHours(cfg.gapMinWallMin)` and stays byte-identical `(< 8h)` at the default 480.
- Job budgets are per job, money-gated, and visible in the tree + per-job report.
- Weekly trends, realization, budget-vs-actual, and period deltas are present on the reports page for billing/admin.
- Audit timeline merges approval + interval events newest-first; `rateCents` diffs are stripped for non-money viewers (#5); the rate column shows only for money viewers.
- Supervisor team view renders supervisees × last 4 weeks with wall/effort/flags; empty state reads 'No team members yet.'
- Exception filter + bulk approve works per row (one bad week never blocks the rest).
- Audit CSV (`events` view) is billing/admin-only and contains approval + leave + interval events for the queried window.
- No new dependencies, no new error codes, no contract file edits, no existing copy changed, gates green.







