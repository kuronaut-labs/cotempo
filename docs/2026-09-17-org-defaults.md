# Org Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins one screen of org-wide defaults — default billable rate for new jobs, default day hours (utilization denominator), and a default weekly hours target — that downstream services actually read.

**Architecture:** A single-row `orgSettings` table (id `'org'`), a settings service that reads it with a hardcoded fallback, and three consumers: the settings admin page (writes), `createJob` (default rate fallback), and `adminKpis` (dayMinutes denominator + week-vs-target KPI). Zod input uses `.nullish()` so absent means "keep" and `null` means "clear".

**Tech Stack:** Drizzle (schema + regenerated migration), Zod v4, TanStack Server Fns + react-form, vitest (tests/integration for the service, services called directly with `deps()`/`asUser()`).

## Global Constraints

- Gate after every task: `npm run check` → exit 0. Belt-and-braces at wrap-up: `npm run test:contract` (all existing files green, no new contract files) and `npm run build`.
- `tests/contract/**` is untouchable (`scripts/check-contract-tests.mjs` hashes it). New tests live in `tests/integration/` and `tests/unit/`.
- No new dependencies. No config-file edits. `src/routeTree.gen.ts` churns when the settings route is added — commit the churn with the route change.
- Money rule (#5/#18): operators never receive a `defaultBillableRateCents` key. `getOrgSettings` **builds the object without the key** for non-billing contexts — never `null`, never `0`. `billableRateCents` semantics elsewhere: `null` = non-billable, `0` = $0.
- Time (#19/#22/#23): integer minutes/hours, no `Date` local-time methods, day math via `src/lib/dayMath.ts` / `src/lib/week.ts` with `deps.tz`.
- Errors (#25): `HttpError` from `src/lib/errors.ts`, upper snake codes. This plan reuses `FORBIDDEN` (403) and `NOT_FOUND` (404) only — no new codes.
- Role checks twice: middleware (`authMw`) at the fn, and inside the service (`isAdmin(ctx)` / `canSeeMoney(ctx)` throw themselves). Contract tests call services without middleware.
- Copy freeze: all existing user-visible strings stay byte-identical. The one documented exception is the utilization hint `'share of an 8-hour day'`, which becomes a template that renders the same string at the seeded default (see Task B2).
- Migrations: edit `drizzle/schema.ts`, regenerate with `npm run db:generate`, never hand-edit `drizzle/migrations/**`. Apply locally with `npm run db:migrate:local` then `npm run db:seed`.
- Service shape (#10/#20): business logic in `src/server/services/settings.ts` as `(deps, ctx, input)` functions; `src/server/fns/settings.ts` are thin wrappers; `src/lib/**` imports nothing from server.
- `nvm` is not installed — node 24 comes from `mise` (already active). Dev server: `npm run dev -- --port 3123 --strictPort`. Seeded logins: `admin@example.com` (password in `.dev.vars`), `billing@example.com` / `ops@example.com` (`demo-password-123`).

## Locked decisions

1. **Org-wide only** (user decision): one row, `id: 'org'`. No per-client/per-worker overrides in v1.
2. **Schema:** `orgSettings { id text pk, defaultBillableRateCents integer nullable, defaultDayMinutes integer notNull default 480, defaultWeeklyTargetHours integer nullable, updatedAt timestamp_ms }`.
3. **Fallback:** when the row is absent (fresh DB before seed), reads return `{ defaultDayMinutes: 480, defaultWeeklyTargetHours: null }` (+ rate key only for money-seeers, value `null`). Constant `FALLBACK_DAY_MINUTES = 480`.
4. **Update semantics:** `OrgSettingsInput` fields are `.nullish()`/`.optional()` — **absent = keep current**, **`null` = clear to null** (rate and weekly target only; `defaultDayMinutes` is `.optional()` because it is `notNull` — absent = keep). Updates are admin-only (`isAdmin`, else `HttpError(403, 'FORBIDDEN')`).
5. **Read shape:** `getOrgSettings(deps, ctx)` returns `{ defaultDayMinutes: number, defaultWeeklyTargetHours: number | null, defaultBillableRateCents?: number | null }` — the rate key exists **only** when `canSeeMoney(ctx)` (#5 omit-key rule). Every authenticated role may read (the leave form and utilization need day minutes).
6. **Upsert:** single `insert ... onConflictDoUpdate({ target: orgSettings.id, set: { ...patch, updatedAt } })` with a `values` base of `{ id: 'org', defaultBillableRateCents: null, defaultDayMinutes: 480, defaultWeeklyTargetHours: null }` so the first-ever update creates the row with sane defaults for the untouched keys.
7. **createJob fallback:** only when input `billableRateCents === undefined` → use the org default (which may be `null` = non-billable). Explicit `null`/`0` are respected as-is. Snapshot semantics (#18) unchanged — the rate is copied onto the job at creation, later settings edits never touch existing jobs or intervals.
8. **adminKpis:** `dayMinutes` comes from settings (replaces the hardcoded `8 * 60` at reports.ts:297 and both utilization sites); new optional KPI fields `weekWallClockMin` + `weeklyTargetHours` render a "Week vs target" tile only when a target is set. Existing integration tests keep passing because the seed sets `defaultDayMinutes: 480` (identical to the old constant).

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `drizzle/schema.ts` (modify) | add `orgSettings` table | A1 |
| `drizzle/migrations/**` (regenerate) | never hand-edit | A1 |
| `src/server/fixtures/demo.ts` (modify) | seed the `'org'` row | A1 |
| `src/lib/schemas/settings.ts` (create) | `OrgSettingsInput` + `OrgSettingsView` type | A2 |
| `src/server/services/settings.ts` (create) | `getOrgSettings` / `updateOrgSettings` | A2 |
| `tests/integration/settings.service.test.ts` (create) | service-level acceptance | A2 |
| `src/server/fns/settings.ts` (create) | thin server fns | A3 |
| `src/routes/_app/admin/settings.tsx` (create) | admin form page | A3 |
| `src/routes/_app/admin/route.tsx` (modify) | subnav link | A3 |
| `src/server/services/structure.ts` (modify) | createJob default-rate fallback | B1 |
| `tests/integration/structure.service.test.ts` (modify) | fallback cases | B1 |
| `src/server/services/reports.ts` (modify) | settings-driven dayMinutes + week target | B2 |
| `tests/integration/reports.service.test.ts` (modify) | utilization responds to settings | B2 |
| `src/routes/_app/reports.tsx` (modify) | "Week vs target" KPI tile | B2 |
| `CLAUDE.md` (modify) | "Where things are" rows | B3 |

Order matters: A2's service reads the table A1 creates; A3's page calls A2's fns; B1/B2 read A2's `getOrgSettings`. Within a task, write tests first.

---

## Wave A — settings core

### Task A1: orgSettings table, migration, seed

**Files:**
- Modify: `drizzle/schema.ts` (append table after `approvalEvents`)
- Regenerate: `drizzle/migrations/**` via `npm run db:generate`
- Modify: `src/server/fixtures/demo.ts` (seed row)

**Interfaces:**
- Produces: drizzle table `orgSettings` (imported as `orgSettings` from `~/drizzle/schema` or the repo's schema module path — mirror how `approvals` is imported in `src/server/services/approvals.ts`), columns `id`, `defaultBillableRateCents`, `defaultDayMinutes`, `defaultWeeklyTargetHours`, `updatedAt`.

- [ ] **Step 1: Add the table to drizzle/schema.ts**

Append after the `approvalEvents` table (same style, same `ts` helper):

```ts
export const orgSettings = sqliteTable('org_settings', {
  id: text('id').primaryKey(),
  defaultBillableRateCents: integer('default_billable_rate_cents'),
  defaultDayMinutes: integer('default_day_minutes').notNull().default(480),
  defaultWeeklyTargetHours: integer('default_weekly_target_hours'),
  updatedAt: ts('updated_at').notNull(),
})
```

If the file's `ts` helper is named differently, use the file's existing helper for `updatedAt` (`integer(..., { mode: 'timestamp_ms' })`).

- [ ] **Step 2: Regenerate the migration**

Run: `npm run db:generate`
Expected: a new `drizzle/migrations/NNNN_*.sql` file containing `CREATE TABLE org_settings (...)`. Do not edit it.

- [ ] **Step 3: Seed the row in src/server/fixtures/demo.ts**

In the seed function, alongside the other inserts (use the same `now`/date variable the file already uses):

```ts
await db.insert(orgSettings).values({
  id: 'org',
  defaultBillableRateCents: 10_000,
  defaultDayMinutes: 480,
  defaultWeeklyTargetHours: 40,
  updatedAt: now,
})
```

Import `orgSettings` the same way the file imports the other tables. `10_000` cents = $100/h — deliberately distinctive so B1's test can tell it from any hardcoded rate.

- [ ] **Step 4: Re-migrate and re-seed local, verify**

Run: `npm run db:migrate:local && npm run db:seed`
Expected: exit 0. Then verify the row exists (adjust the path/tool to the repo's local sqlite if different):

Run: `npx wrangler d1 execute DB --local --command "select id, default_billable_rate_cents, default_day_minutes, default_weekly_target_hours from org_settings"`
Expected: one row: `org | 10000 | 480 | 40`.

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → exit 0 (schema compiles; no test churn expected).

```bash
git add drizzle/schema.ts drizzle/migrations src/server/fixtures/demo.ts
git commit -m "feat: org settings schema and seed"
```

### Task A2: settings schema + service (TDD)

**Files:**
- Create: `src/lib/schemas/settings.ts`
- Create: `src/server/services/settings.ts`
- Test: `tests/integration/settings.service.test.ts`

**Interfaces:**
- Consumes: `Deps` from `~/server/services/deps`, `SessionContext` from `~/server/context` (`isAdmin`, `canSeeMoney` are exported there), `HttpError` from `~/lib/errors`, `orgSettings` table.
- Produces:
  - `OrgSettingsInput` (zod schema + type): `{ defaultBillableRateCents?: number | null, defaultDayMinutes?: number, defaultWeeklyTargetHours?: number | null }`
  - `OrgSettingsView` (type): `{ defaultDayMinutes: number; defaultWeeklyTargetHours: number | null; defaultBillableRateCents?: number | null }`
  - `getOrgSettings(deps: Deps, ctx: SessionContext): Promise<OrgSettingsView>`
  - `updateOrgSettings(deps: Deps, ctx: SessionContext, input: OrgSettingsInput): Promise<OrgSettingsView>`
  - B1/B2 consume `getOrgSettings` only.

- [ ] **Step 1: Write the failing test**

`tests/integration/settings.service.test.ts` (mirror the header/imports of `tests/integration/leave.service.test.ts` or another service test — `db`, `deps`, `asUser`, `resetDb` come from `./helpers`):

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from './helpers'
import { getOrgSettings, updateOrgSettings } from '~/server/services/settings'
import { orgSettings } from '~/drizzle/schema'
import { deps, asUser, resetDb } from './helpers'

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await db.close?.()
})

describe('settings service', () => {
  it('falls back to 480 / no target when the row is absent', async () => {
    await db.delete(orgSettings)
    const v = await getOrgSettings(deps(), asUser('operator'))
    expect(v.defaultDayMinutes).toBe(480)
    expect(v.defaultWeeklyTargetHours).toBeNull()
    expect('defaultBillableRateCents' in v).toBe(false)
  })

  it('omits the rate key for operators and shows it for billing', async () => {
    const op = await getOrgSettings(deps(), asUser('operator'))
    expect(Object.keys(op)).not.toContain('defaultBillableRateCents')
    const bill = await getOrgSettings(deps(), asUser('billing'))
    expect(bill.defaultBillableRateCents).toBe(10_000)
  })

  it('update is admin-only', async () => {
    await expect(updateOrgSettings(deps(), asUser('billing'), { defaultDayMinutes: 300 })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
    await expect(updateOrgSettings(deps(), asUser('operator'), { defaultDayMinutes: 300 })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })

  it('update patches only provided keys and creates the row on first write', async () => {
    await db.delete(orgSettings)
    const v = await updateOrgSettings(deps(), asUser('admin'), { defaultDayMinutes: 300 })
    expect(v.defaultDayMinutes).toBe(300)
    expect(v.defaultWeeklyTargetHours).toBeNull()
    const bill = await getOrgSettings(deps(), asUser('billing'))
    expect(bill.defaultBillableRateCents).toBeNull()
  })

  it('null clears rate and target; absent keeps them', async () => {
    await updateOrgSettings(deps(), asUser('admin'), { defaultBillableRateCents: null, defaultWeeklyTargetHours: null })
    let bill = await getOrgSettings(deps(), asUser('billing'))
    expect(bill.defaultBillableRateCents).toBeNull()
    expect(bill.defaultWeeklyTargetHours).toBeNull()
    await updateOrgSettings(deps(), asUser('admin'), { defaultBillableRateCents: 5_000 })
    bill = await getOrgSettings(deps(), asUser('billing'))
    expect(bill.defaultBillableRateCents).toBe(5_000)
    expect(bill.defaultWeeklyTargetHours).toBeNull()
  })

  it('sees the seeded values', async () => {
    const bill = await getOrgSettings(deps(), asUser('billing'))
    expect(bill).toMatchObject({ defaultDayMinutes: 480, defaultWeeklyTargetHours: 40, defaultBillableRateCents: 10_000 })
  })
})
```

Note: `resetDb()` should leave the seeded `'org'` row in place if it only wipes business tables; the first two tests delete it explicitly so they are hermetic either way. If `resetDb()` does wipe orgSettings and re-seeding is required, call the demo seed helper instead — mirror whatever `tests/integration`'s existing setup does for seeded reference data.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/integration/settings.service.test.ts`
Expected: FAIL — cannot resolve `~/server/services/settings`.

- [ ] **Step 3: Write src/lib/schemas/settings.ts**

```ts
import { z } from 'zod'

// absent = keep current, null = clear (rate, weekly target). dayMinutes is
// notNull in storage so it is optional-only here.
export const OrgSettingsInput = z.object({
  defaultBillableRateCents: z.number().int().min(0).max(10_000_000).nullish(),
  defaultDayMinutes: z.number().int().min(15).max(720).optional(),
  defaultWeeklyTargetHours: z.number().int().min(0).max(80).nullish(),
})
export type OrgSettingsInput = z.infer<typeof OrgSettingsInput>

export type OrgSettingsView = {
  defaultDayMinutes: number
  defaultWeeklyTargetHours: number | null
  defaultBillableRateCents?: number | null
}
```

- [ ] **Step 4: Write src/server/services/settings.ts**

```ts
import { eq } from 'drizzle-orm'
import { db as rootDb } from '~/server/db'
import type { Deps } from './deps'
import { canSeeMoney, isAdmin, type SessionContext } from '~/server/context'
import { HttpError } from '~/lib/errors'
import { orgSettings } from '~/drizzle/schema'
import type { OrgSettingsInput, OrgSettingsView } from '~/lib/schemas/settings'

export const FALLBACK_DAY_MINUTES = 480

export async function getOrgSettings(deps: Deps, ctx: SessionContext): Promise<OrgSettingsView> {
  const [row] = await deps.db.select().from(orgSettings).where(eq(orgSettings.id, 'org'))
  const view: OrgSettingsView = {
    defaultDayMinutes: row?.defaultDayMinutes ?? FALLBACK_DAY_MINUTES,
    defaultWeeklyTargetHours: row?.defaultWeeklyTargetHours ?? null,
  }
  if (canSeeMoney(ctx)) view.defaultBillableRateCents = row?.defaultBillableRateCents ?? null
  return view
}

export async function updateOrgSettings(deps: Deps, ctx: SessionContext, input: OrgSettingsInput): Promise<OrgSettingsView> {
  if (!isAdmin(ctx)) throw new HttpError(403, 'FORBIDDEN')
  const patch: Partial<typeof orgSettings.$inferInsert> = {}
  if (input.defaultBillableRateCents !== undefined) patch.defaultBillableRateCents = input.defaultBillableRateCents
  if (input.defaultDayMinutes !== undefined) patch.defaultDayMinutes = input.defaultDayMinutes
  if (input.defaultWeeklyTargetHours !== undefined) patch.defaultWeeklyTargetHours = input.defaultWeeklyTargetHours
  if (Object.keys(patch).length > 0) {
    patch.updatedAt = deps.now()
    await deps.db
      .insert(orgSettings)
      .values({ id: 'org', defaultBillableRateCents: null, defaultDayMinutes: FALLBACK_DAY_MINUTES, defaultWeeklyTargetHours: null, ...patch })
      .onConflictDoUpdate({ target: orgSettings.id, set: patch })
  }
  return getOrgSettings(deps, ctx)
}
```

Import details to adjust to the repo's real paths when implementing: the schema import (`~/drizzle/schema` vs wherever `approvals` comes from in `src/server/services/approvals.ts` — copy that file's import line), and drop the unused `rootDb` import if the lint complains (it is listed here only to point at the db module; `deps.db` is what the service uses). Do not import `requireAdmin` from structure.ts — it is module-private there; use `isAdmin(ctx)` directly (role checks twice, #4).

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run tests/integration/settings.service.test.ts`
Expected: PASS — 6/6.

- [ ] **Step 6: Gate + commit**

Run: `npm run check` → exit 0.

```bash
git add src/lib/schemas/settings.ts src/server/services/settings.ts tests/integration/settings.service.test.ts
git commit -m "feat: org settings schema and service"
```

### Task A3: settings fns + admin page

**Files:**
- Create: `src/server/fns/settings.ts`
- Create: `src/routes/_app/admin/settings.tsx`
- Modify: `src/routes/_app/admin/route.tsx` (subnav link)

**Interfaces:**
- Consumes: `getOrgSettings` / `updateOrgSettings` from A2, `OrgSettingsInput` from `~/lib/schemas/settings`, fn pattern from `src/server/fns/approvals.ts` (`createServerFn`, `authMw`, `ctxOf`, `runtimeDeps`).
- Produces: `getOrgSettingsFn` (GET), `updateOrgSettingsFn` (POST, validator `OrgSettingsInput`); route `/admin/settings` with a working form.

- [ ] **Step 1: Write src/server/fns/settings.ts**

Mirror `src/server/fns/approvals.ts` exactly (imports + chain + trailing type re-export):

```ts
import { createServerFn } from '@tanstack/react-start'
import { OrgSettingsInput } from '~/lib/schemas/settings'
import { authMw, ctxOf } from '~/server/middleware/authMw'
import { runtimeDeps } from '~/server/runtimeDeps'
import * as svc from '~/server/services/settings'

export const getOrgSettingsFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .handler(({ context }) => svc.getOrgSettings(runtimeDeps(), ctxOf(context)))

export const updateOrgSettingsFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(OrgSettingsInput)
  .handler(({ data, context }) => svc.updateOrgSettings(runtimeDeps(), ctxOf(context), data))

export type { OrgSettingsView } from '~/server/services/settings'
export type { OrgSettingsInput } from '~/lib/schemas/settings'
```

Note: the GET fn carries no validator (there is no input). The page calls these via `useLoaderData` + direct invocation like `_app/admin/workers.tsx` does for its mutations.

- [ ] **Step 2: Add the subnav link**

In `src/routes/_app/admin/route.tsx`, add a `Link to="/admin/settings"` "Settings" entry after "Workers" (identical className pattern to the sibling links).

- [ ] **Step 3: Write src/routes/_app/admin/settings.tsx**

Data + mutation pattern mirrors `_app/admin/workers.tsx`: `loader` → `Route.useLoaderData()`, `useRouter()` + `router.invalidate()` after save. Form via `@tanstack/react-form` with an inline zod validator + `applyServerError` (the repo's shared form pattern, #8). Copy (new screen, frozen once landed): `'Settings'`, `'Default billable rate'`, `'Default day hours'`, `'Default weekly target'`, `'Save settings'`.

```tsx
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { Check } from 'reicon-react'
import { Button } from '~/components/ui/button'
import { applyServerError, serverErrorMessage } from '~/components/forms/applyServerError'
import { getOrgSettingsFn, updateOrgSettingsFn } from '~/server/fns/settings'
import { formatCents } from '~/lib/money'

const FormInput = z.object({
  rateDollarsPerHour: z.string(), // '' or numeric text; validated below
  dayHours: z.number().min(0.25).max(12),
  weeklyTargetHours: z.string(), // '' = clear, numeric text = set
})

export const Route = createFileRoute('/_app/admin/settings')({
  loader: () => getOrgSettingsFn(),
  component: SettingsPage,
})

function SettingsPage() {
  const settings = Route.useLoaderData()
  const router = useRouter()
  const form = useForm({
    defaultValues: {
      rateDollarsPerHour:
        settings.defaultBillableRateCents != null ? String(settings.defaultBillableRateCents / 100) : '',
      dayHours: settings.defaultDayMinutes / 60,
      weeklyTargetHours: settings.defaultWeeklyTargetHours != null ? String(settings.defaultWeeklyTargetHours) : '',
    },
    validators: {
      onSubmit: FormInput.superRefine((v, ctx) => {
        if (v.rateDollarsPerHour !== '' && !/^\d+(\.\d{1,2})?$/.test(v.rateDollarsPerHour))
          ctx.addIssue({ path: ['rateDollarsPerHour'], message: 'Enter a dollar amount like 150 or 150.50, or leave blank' })
        if (v.weeklyTargetHours !== '' && !/^\d{1,2}$/.test(v.weeklyTargetHours))
          ctx.addIssue({ path: ['weeklyTargetHours'], message: 'Enter whole hours 0-80, or leave blank' })
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await updateOrgSettingsFn({
          data: {
            defaultBillableRateCents: value.rateDollarsPerHour === '' ? null : Math.round(Number(value.rateDollarsPerHour) * 100),
            defaultDayMinutes: Math.round(value.dayHours * 60),
            defaultWeeklyTargetHours: value.weeklyTargetHours === '' ? null : Number(value.weeklyTargetHours),
          },
        })
        await router.invalidate()
      } catch (e) {
        applyServerError(form, e)
      }
    },
  })
  return (
    <main className="admin">
      <header className="admin-head">
        <h1>Settings</h1>
      </header>
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <form.Field name="rateDollarsPerHour">
          {(field) => (
            <label className="field">
              <span>Default billable rate</span>
              <input
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="150"
                inputMode="decimal"
              />
              {settings.defaultBillableRateCents != null && (
                <span className="status-msg">Currently {formatCents(settings.defaultBillableRateCents)} per hour</span>
              )}
            </label>
          )}
        </form.Field>
        <form.Field name="dayHours">
          {(field) => (
            <label className="field">
              <span>Default day hours</span>
              <input
                type="number"
                step="0.25"
                min="0.25"
                max="12"
                value={field.state.value}
                onChange={(e) => field.handleChange(Number(e.target.value))}
              />
              <span className="status-msg">Used as the denominator in utilization reports</span>
            </label>
          )}
        </form.Field>
        <form.Field name="weeklyTargetHours">
          {(field) => (
            <label className="field">
              <span>Default weekly target</span>
              <input
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="40"
                inputMode="numeric"
              />
            </label>
          )}
        </form.Field>
        <form.Subscribe>
          {(s) => (
            <Button type="submit" variant="primary" disabled={s.isSubmitting}>
              <Check size={14} /> Save settings
            </Button>
          )}
        </form.Subscribe>
        {String(form.state.errorMap.onServer ?? '') && (
          <p role="alert" className="form-error">
            {String(form.state.errorMap.onServer)}
          </p>
        )}
      </form>
    </main>
  )
}
```

Notes: the server fn input is assembled in `onSubmit` (rate text → cents, blank → `null`). The rate field is only rendered with its "Currently" hint for admins — the page is admin-only by nav, and the fn re-checks nothing (the service enforces `isAdmin`). `routeTree.gen.ts` will churn — stage it with this commit.

- [ ] **Step 4: Gate + eyeball**

Run: `npm run check` → exit 0.
Eyeball (deferred to human, no browser): `/admin/settings` shows the three fields with 150-blank/8/40 seeded values, save round-trips.

- [ ] **Step 5: Commit**

```bash
git add src/server/fns/settings.ts src/routes/_app/admin/settings.tsx src/routes/_app/admin/route.tsx src/routeTree.gen.ts
git commit -m "feat: settings admin page"
```

---

## Wave B — consumers

### Task B1: default rate for new jobs

**Files:**
- Modify: `src/server/services/structure.ts` (inside `createJob` only)
- Test: `tests/integration/structure.service.test.ts` (extend)

**Interfaces:**
- Consumes: `getOrgSettings` from A2 (import from `./settings`); existing `createJob(deps, ctx, input)` — signature unchanged.
- Produces: no new exports. Behavior: `input.billableRateCents === undefined` → org default (may be `null`).

- [ ] **Step 1: Write the failing tests**

Append to the existing `createJob` describe block in `tests/integration/structure.service.test.ts` (reuse the file's existing helpers for making a client/project — mirror its current happy-path test):

```ts
it('falls back to the org default rate when the input omits billableRateCents', async () => {
  const input = { /* same as the file's existing createJob happy path, minus billableRateCents */ }
  const job = await createJob(deps(), asUser('admin'), input)
  expect(job.billableRateCents).toBe(10_000) // seeded org default
})

it('explicit null stays non-billable and explicit 0 stays $0', async () => {
  const nullJob = await createJob(deps(), asUser('admin'), { /* happy path input, */ billableRateCents: null })
  expect(nullJob.billableRateCents).toBeNull()
  const zeroJob = await createJob(deps(), asUser('admin'), { /* happy path input, */ billableRateCents: 0 })
  expect(zeroJob.billableRateCents).toBe(0)
})

it('a changed org default applies to the next job only', async () => {
  await updateOrgSettings(deps(), asUser('admin'), { defaultBillableRateCents: 7_500 })
  const job = await createJob(deps(), asUser('admin'), { /* happy path input, minus rate */ })
  expect(job.billableRateCents).toBe(7_500)
})
```

Add `updateOrgSettings` to the imports from `~/server/services/settings`. Copy the concrete happy-path input from the file's existing `createJob` test — do not invent ids; use the same client/project the file already creates.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/integration/structure.service.test.ts`
Expected: FAIL — fallback test gets `undefined`/`null` rate instead of `10_000`.

- [ ] **Step 3: Implement the fallback in createJob**

In `src/server/services/structure.ts`, inside `createJob`, replace the `billableRateCents` expression in the insert values with:

```ts
const rate =
  input.billableRateCents !== undefined
    ? input.billableRateCents
    : (await getOrgSettings(deps, ctx)).defaultBillableRateCents ?? null
```

Add `import { getOrgSettings } from './settings'` at the top. Keep the file's existing comment about snapshots (#18) — the default is snapshotted onto the job exactly like a caller-supplied rate. `?? null` keeps the type `number | null` even if the view key were absent.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/integration/structure.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `npm run check` → exit 0.

```bash
git add src/server/services/structure.ts tests/integration/structure.service.test.ts
git commit -m "feat: default rate for new jobs"
```

Note (not a task): the admin jobs form gets no prefill — the tree shows the resulting rate server-side, and the default is applied on save. YAGNI.

### Task B2: settings-driven utilization + week-vs-target KPI

**Files:**
- Modify: `src/server/services/reports.ts` (`adminKpis` only)
- Test: `tests/integration/reports.service.test.ts` (extend)
- Modify: `src/routes/_app/reports.tsx` (KPI tile + hint)

**Interfaces:**
- Consumes: `getOrgSettings` from `./settings`; existing `loadPieces`, `recon`, `groupBy`, `localDayBoundariesUtcMs` (same module); `isoWeekStart` from `~/lib/week`; `weekDates` from `~/lib/week` (for the week-end iso).
- Produces: `AdminKpis` gains `defaultDayMinutes: number`, `weekWallClockMin?: number`, and `weeklyTargetHours: number | null` (existing fields unchanged; both utilization sites read the settings denominator).

- [ ] **Step 1: Write the failing test**

Append to the `adminKpis` describe block in `tests/integration/reports.service.test.ts` (reuse the file's existing day-fixture setup — mirror its current utilization test):

```ts
it('utilization denominator follows the org day-minutes setting', async () => {
  await updateOrgSettings(deps(), asUser('admin'), { defaultDayMinutes: 240 })
  const k = await adminKpis(deps(), asUser('billing'), { date: /* same date the file's existing kpi test uses */ })
  // same pieces as the 480 case → half the denominator → double the utilization
  expect(k.perWorker[0]!.utilization).toBeCloseTo(/* existing value */ * 2, 5)
})

it('reports the weekly target and week wall-clock when a target is set', async () => {
  const k = await adminKpis(deps(), asUser('billing'), { date: /* same date */ })
  expect(k.weeklyTargetHours).toBe(40) // seeded
  expect(typeof k.weekWallClockMin).toBe('number')
})
```

Fill the `/* ... */` slots from the file's existing adminKpis test — same date, same expected per-worker utilization value. Add `updateOrgSettings` + `adminKpis` (if not already) to the imports.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/integration/reports.service.test.ts`
Expected: FAIL — utilization does not move (still 480 denominator); `weeklyTargetHours` missing.

- [ ] **Step 3: Implement in adminKpis**

In `src/server/services/reports.ts` `adminKpis`:

1. After the `canSeeMoney` guard, load settings once:

```ts
const settings = await getOrgSettings(deps, ctx)
const dayMinutes = settings.defaultDayMinutes
```

Add `import { getOrgSettings } from './settings'`.

2. Delete `const dayMinutes = 8 * 60` (reports.ts:297). Keep the `#M1` comment on the per-worker line but update its wording to reference the setting, e.g. `Per-worker denominator is a single default day (org setting), not headcount × day (#M1)`.

3. Both utilization sites keep their formulas — they now read the local `dayMinutes`: per-worker `r.wallClockMin / dayMinutes`, aggregate `humans > 0 ? dayR.wallClockMin / (humans * dayMinutes) : 0`.

4. Extend the return object with:

```ts
defaultDayMinutes: dayMinutes,
weekWallClockMin: weekR.wallClockMin,
weeklyTargetHours: settings.defaultWeeklyTargetHours,
```

where, before the return:

```ts
const weekStartIso = isoWeekStart(deps.now().getTime(), deps.tz)
const weekEndIso = weekDates(weekStartIso)[6]!
const weekR = recon(await loadPieces(deps, { from: weekStartIso, to: weekEndIso }))
```

Add `isoWeekStart` and `weekDates` to the existing `~/lib/week` import (verify the module's actual export names when implementing — they are the same helpers the approvals service uses for week math). Update the `AdminKpis` type (reports.ts:46-48) with the three new fields: `defaultDayMinutes: number`, `weekWallClockMin?: number`, `weeklyTargetHours: number | null`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/integration/reports.service.test.ts`
Expected: PASS — new cases green, existing kpi/utilization cases still green (seeded 480 = old constant).

- [ ] **Step 5: Reports page — tile + hint**

In `src/routes/_app/reports.tsx`, inside the KPI tiles block:

1. The utilization tile's hint is currently the frozen string `'share of an 8-hour day'`. Replace the literal with the template `` `share of an ${kpis.defaultDayMinutes / 60}-hour day` `` — **add `defaultDayMinutes: number` to the AdminKpis return + type in Step 3** so the page can render it. At the seeded 480 this renders the byte-identical string; the wording only changes when an admin actually changes day hours. This is the plan's single documented copy-freeze exception.
2. Render a "Week vs target" tile after the utilization tile, only when `kpis.weeklyTargetHours != null`:

```tsx
{kpis.weeklyTargetHours != null && (
  <div className="kpi">
    <div className="k">Week vs target</div>
    <div className="v">{formatHmm(kpis.weekWallClockMin ?? 0)}</div>
    <div className="hint">of {formatHmm(kpis.weeklyTargetHours * 60)} target</div>
  </div>
)}
```

`formatHmm` is already imported in the reports route (verify; if not, add it from `~/lib/money`). "Week vs target" and "of … target" are new copy (frozen once landed).

- [ ] **Step 6: Gate + commit**

Run: `npm run check` → exit 0.

```bash
git add src/server/services/reports.ts tests/integration/reports.service.test.ts src/routes/_app/reports.tsx
git commit -m "feat: settings-driven utilization and target kpi"
```

### Task B3: wrap-up

**Files:**
- Modify: `CLAUDE.md` ("Where things are" table)

**Interfaces:** none.

- [ ] **Step 1: CLAUDE.md rows**

Add to the "Where things are" table:

```markdown
| Org settings (defaults) | `src/lib/schemas/settings.ts`, `src/server/services/settings.ts`, `src/server/fns/settings.ts` |
| Settings admin page | `src/routes/_app/admin/settings.tsx` |
```

- [ ] **Step 2: Full gates**

Run: `npm run check` → exit 0.
Run: `npm run test:contract` → all existing contract files green (no new/changed files).
Run: `npm run build` → exit 0, no unexpected routeTree churn.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore: settings wrap-up"
```

---

## Done criteria

- Seeded `'org'` row: rate `10_000`, day `480`, weekly `40`; absent-row fallback `480 / null`.
- `getOrgSettings` omits the rate key for non-billing (#5) — proven by `Object.keys` test.
- `updateOrgSettings` admin-only; absent=keep, null=clear; first write creates the row.
- `createJob` with `billableRateCents === undefined` gets the org default; explicit `null`/`0` respected; later edits never touch existing jobs/intervals (#18).
- `adminKpis` reads `defaultDayMinutes` from settings at both utilization sites; utilization doubles when dayMinutes halves; "Week vs target" tile appears only when a target is set.
- Utilization hint renders byte-identical `'share of an 8-hour day'` at the default.
- `tests/contract/**` untouched; no new dependencies; no config edits; `npm run check` exit 0 at every commit.

## Follow-up notes (not tasks)

- The leave request form's "hours per day" default (8) may later read `defaultDayMinutes / 60` — leave plan v1 ships the literal 8; a one-line follow-up if wanted.
- Per-client rate templates and per-worker day hours were explicitly out of scope (org-wide only, user decision).

