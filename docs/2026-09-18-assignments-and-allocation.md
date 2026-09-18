# Assignments & Allocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Projects and jobs carry due dates; admins assign people (humans and agents) to projects or jobs; each assignment can carry an hours allocation; reports show allocated vs logged vs remaining with a pace against the due date; operators see their assignments where they enter time; an optional org setting refuses time on unassigned jobs.

**Architecture:** Six waves. Wave 1 adds `dueOn` to projects and jobs. Wave 2 adds an `assignments` table with admin UI. Wave 3 adds hours allocation and a time-only consumption report over the existing `loadPieces` path. Wave 4 surfaces assignments in the entry form, Today and the approver view. Wave 5 adds default-off enforcement in the interval service. Wave 6 is docs and the final gate. Assignments are planning data first and a gate second; nothing about who may log time changes until Wave 5 and only when the setting is on.

**Tech Stack:** TanStack Start (createServerFn), Drizzle (D1, `npm run db:generate`), zod v4, vitest (unit + integration projects), existing design system (Button/StatusChip/[data-tip], `structureTree.tsx` patterns).

## Global Constraints

- Node 24 via **nvm** (`.nvmrc`); the shell default is Node 21, so `export PATH=~/.nvm/versions/node/v24.19.0/bin:$PATH` before any npm/npx. Gate: `npm run check` exit 0 (contract-manifest + eslint + tsc + unit/integration). Belt-and-braces: `npm run test:contract`. `tsc` covers `tests/**`, so test files must typecheck too.
- `tests/contract/**` is untouchable. New tests go in `tests/unit` / `tests/integration` only.
- Migrations: `npm run db:generate`, never hand-edit; apply with `npm run db:migrate:local`. This plan needs three (Tasks 1.1, 2.1, 5.1). Numbers depend on whether `docs/2026-09-17-audit-and-reporting.md` has landed; use the next free number each time.
- No new dependencies. zod v4: `ctx.addIssue({ code: 'custom', ... })` in superRefine.
- **Money (#5/#18):** assignments and allocations carry no money. Never add a `cents`-shaped key to any type in this plan, for any role. Allocation reports reuse `TimeRecon`, never `Recon`.
- **Time:** durations are integer minutes (`allocatedMinutes`, `loggedMinutes`); UI hours × 60; display via `formatHmm`. Dates are org-tz ISO `YYYY-MM-DD` strings (`dueOn`), like `approvals.weekStart`. Instants stay `timestamp_ms` via `deps.now()`. Day math via `src/lib/dayMath.ts` / `src/lib/week.ts`.
- **Copy freeze:** existing user-visible strings stay byte-identical. Each task lists its NEW copy (frozen once landed).
- **Services (#10/#20):** `(deps, ctx, input)` in `src/server/services/*.ts`; fns are thin wrappers. Role checks in middleware AND in the service. New service files, not edits to fixed signatures in `reports.ts` / `intervals.ts` beyond what Task 5.2 names.
- **Errors (#25):** `HttpError(status, CODE, field?, data?)`. New codes this plan adds: `ASSIGNMENT_EXISTS` 409 (`data.conflictingId`), `TARGET_ARCHIVED` 409 (`targetId`), `NOT_ASSIGNED` 403 (`jobId`). Reused: `FORBIDDEN`, `FORBIDDEN_TARGET`, `NOT_FOUND`.
- **Never hard-delete (rule 9):** unassign sets `archivedAt`. Reads filter it.
- **Seeded overlaps:** opWorker has seeded j1 intervals on day 0 (09–12 UTC) and day 2 (14–18 UTC). New test intervals for opWorker use day 4.
- **Org settings leak:** `resetDb` re-seeds `org_settings` with `onConflictDoNothing`. Any test file that reads or writes settings resets the row in `beforeEach` (`db.delete(orgSettings)` + `insertDemo(db)`).
- Test helpers (`tests/integration/helpers.ts`): `deps()` fixed clock `2026-09-05` (Saturday) Perth; `asUser('admin' | 'billing' | 'operator')`; `asUser('operator')` is `opWorker` with supervisees `agent1`, `agent2`; `resetDb()`; `at(dayOffset, h, m)`; `ids`.
- Demo facts: anchor Monday `2026-08-31`; humans `opWorker` ('Demo Operator', position posSenior), `billingWorker`, `adminWorker`; agents `agent1` 'Atlas', `agent2` 'Beacon' supervised by opWorker; `c1` Acme → `p1` → `j1` $140, `j2` $90; `c2` Nimbus → `p2` → `j3` $120, `j4` non-billable.
- `src/routeTree.gen.ts`: this plan adds no routes, so it must not churn. If it does, something was added off-plan.
- **Coordination:** this plan and the audit plan both touch `jobs`, `org_settings`, `structureTree.tsx`, `reports.tsx`, and `loadIntervalsInRange`. Land one before starting the other.

## Locked Decisions

1. **Assignments are planning data first, gate second.** Until Task 5.2 and only with `requireAssignment` on, anyone may still log to any live job (#7 stands by default).
2. **One assignment row per (worker, target).** `targetKind` is `'project' | 'job'`. A project assignment implies every live job under that project; a job assignment is narrower. Effective set = union, resolved in `src/lib/allocation.ts`.
3. **Allocation is one integer `allocatedMinutes` per assignment**, total for the engagement, nullable (null = no cap). No weekly cadence in v1.
4. **Due dates are nullable ISO dates** on both `projects` and `jobs`. A job due after its project is allowed and surfaced as a flag, never rejected.
5. **Admin owns dates and assignments** (#5: admin owns structure). Billing views all. Operators view self + supervisees (`assertCanViewWorker`).
6. **Pace is linear burn** from the assignment's creation day to `dueOn`. No due date or no allocation → `'n/a'`.
7. **Unassigned-entry count in the approver view is advisory text, not a red flag.** `RedFlagInput`'s signature is fixed (rule 10) and the contract asserts the flag-kinds array exactly.
8. **Enforcement exempts admin** (mirrors #17) and is judged against the target worker's assignments, not the actor's.

**Decision impact to record in `.wayfinder` (read-only here):** #9 says "client assignment → pure via jobs/intervals"; an `assignments` table refines #4/#9. #5 gains `assign_worker` (admin) and `view_assignments` (self + supervisees). Task 5.2 adds a setting-gated exception to #7's entry rule and a step to the rule-3 guard order.

## Feature → Task Map

| Feature | Task |
|---|---|
| Due dates on projects and jobs | 1.1 (schema + service) + 1.2 (lib + UI) |
| Assign people to projects and jobs | 2.1 (schema + service) + 2.2 (admin UI) |
| Hours allocation per assignment | 3.1 (input) + 3.2 (report + CSV) |
| Assignments where time is entered | 4.1 (entry form + Today) + 4.2 (approver advisory) |
| Optional enforcement | 5.1 (setting) + 5.2 (interval guard) |
| Docs + final gate | 6.1 |

## File Structure

| File | Responsibility |
|---|---|
| `drizzle/schema.ts` | `dueOn` on projects/jobs; `assignments` table; `orgSettings.requireAssignment` |
| `drizzle/migrations/**` | generated, three migrations |
| `src/lib/dueDates.ts` (new) | `dueStatus`, `jobDueAfterProject` |
| `src/lib/allocation.ts` (new) | `effectiveJobIds`, `pace` |
| `src/lib/schemas/structure.ts` | `dueOn` on create/update inputs |
| `src/lib/schemas/assignments.ts` (new) | assignment inputs |
| `src/lib/schemas/settings.ts` | `requireAssignment` |
| `src/lib/schemas/reports.ts` | `ExportCsvInput` view `'allocations'` |
| `src/server/services/structure.ts` | persist `dueOn`; node types |
| `src/server/services/assignments.ts` (new) | CRUD + visibility |
| `src/server/services/allocations.ts` (new) | allocation report |
| `src/server/services/reports.ts` | `jobIds` filter on `loadIntervalsInRange` (if audit B3 has not landed) |
| `src/server/services/exports.ts` | `'allocations'` CSV branch |
| `src/server/services/settings.ts` | `requireAssignment` get/set |
| `src/server/services/intervals.ts` | `assertAssigned` guard (Task 5.2) |
| `src/server/fns/{assignments,allocations}.ts` (new), `fns/structure.ts`, `fns/settings.ts` | wrappers |
| `src/components/structureTree.tsx` | due date inputs/chips; assignment pills |
| `src/components/entryForm.tsx` | 'Assigned' optgroup |
| `src/components/approverView.tsx` | unassigned advisory |
| `src/routes/_app/admin/{workers,settings}.tsx`, `src/routes/_app/{today,reports}.tsx` | UI |
| `src/server/fixtures/demo.ts` | due dates + assignments |
| `tests/unit/{dueDates,allocation}.test.ts`, `tests/integration/{structure,assignments.service,allocations.service,exports.service,intervals,settings.service}.test.ts` | tests |

---

## Wave 1 · Dates on the tree

### Task 1.1: `dueOn` schema + service

**Files:**
- Modify: `drizzle/schema.ts` (`projects`, `jobs`), `drizzle/migrations/**` (generate)
- Modify: `src/lib/schemas/structure.ts`, `src/server/services/structure.ts`
- Modify: `src/server/fixtures/demo.ts`
- Test: `tests/integration/structure.test.ts` (append)

**Interfaces:**
- `ProjectNode.dueOn: string | null`, `JobNode.dueOn: string | null` (not money, present for every role).
- `CreateProjectInput`, `UpdateProjectInput`, `CreateJobInput`, `UpdateJobInput` gain `dueOn: z.iso.date().nullish()` (update: `null` clears, `undefined` keeps).

- [ ] **Step 1: Schema + migration**

`drizzle/schema.ts`, in `projects` and `jobs` after `name`:

```ts
  dueOn: text('due_on'), // org-tz 'YYYY-MM-DD'; null = no due date
```

```bash
npm run db:generate && npm run db:migrate:local
```

- [ ] **Step 2: Failing tests**

Append to `tests/integration/structure.test.ts`:

```ts
it('projects and jobs carry a nullable due date for every role', async () => {
  const live = { includeArchived: false }
  const { id: pid } = await createProject(deps(), asUser('admin'), { clientId: ids.c1, name: 'Dated', dueOn: '2026-10-30' })
  const { id: jid } = await createJob(deps(), asUser('admin'), { projectId: pid, name: 'Dated job', dueOn: '2026-10-15' })
  const find = (tree: Awaited<ReturnType<typeof listStructure>>) => {
    const p = tree.flatMap((c) => c.projects).find((p) => p.id === pid)!
    return { p, j: p.jobs.find((j) => j.id === jid)! }
  }
  const admin = find(await listStructure(deps(), asUser('admin'), live))
  expect(admin.p.dueOn).toBe('2026-10-30')
  expect(admin.j.dueOn).toBe('2026-10-15')
  const ops = find(await listStructure(deps(), asUser('operator'), live))
  expect(ops.j.dueOn).toBe('2026-10-15') // dates are not money; operators see them
  await updateJob(deps(), asUser('admin'), { id: jid, dueOn: null })
  expect(find(await listStructure(deps(), asUser('admin'), live)).j.dueOn).toBeNull()
  await updateProject(deps(), asUser('admin'), { id: pid, name: 'Dated' }) // undefined keeps
  expect(find(await listStructure(deps(), asUser('admin'), live)).p.dueOn).toBe('2026-10-30')
})
```

`updateProject` is already imported in that file's import block? Add it if not (`createProject`, `createJob`, `updateJob`, `listStructure` are).

- [ ] **Step 3: Run to verify it fails**

`npx vitest run tests/integration/structure.test.ts` → FAIL (unknown key `dueOn`).

- [ ] **Step 4: Implement**

`src/lib/schemas/structure.ts`:

```ts
const dueOn = z.iso.date().nullish()
export const CreateProjectInput = z.object({ clientId: z.string().min(1), name, dueOn })
export const UpdateProjectInput = z.object({ id: z.string().min(1), name, dueOn })
export const CreateJobInput = z.object({ projectId: z.string().min(1), name, billableRateCents: createRate, dueOn })
export const UpdateJobInput = z.object({ id: z.string().min(1), name: name.optional(), billableRateCents: rate.optional(), dueOn })
```

`src/server/services/structure.ts`:
- `JobNode` and `ProjectNode` gain `dueOn: string | null`.
- `listStructure`: both branches of the job-node ternary add `dueOn: j.dueOn`; the project literal adds `dueOn: p.dueOn`.
- `createProject` / `createJob` insert `dueOn: input.dueOn ?? null`.
- `updateProject`: build a `patch` like `updateJob` does (`name` always present today; add `if (input.dueOn !== undefined) patch.dueOn = input.dueOn`).
- `updateJob`: `if (input.dueOn !== undefined) patch.dueOn = input.dueOn`.

`src/server/fixtures/demo.ts`: `p1` `dueOn: '2026-10-30'`, `j1` `dueOn: '2026-09-08'` (soon relative to the 2026-09-05 test clock), `j3` `dueOn: '2026-09-01'` (overdue). `p2`, `j2`, `j4` stay null.

- [ ] **Step 5: Verify + gate + commit**

`npx vitest run tests/integration/structure.test.ts` → PASS. `npm run check` → exit 0. `phase4-structure.contract.test.ts` matches `billableRateCents` by regex, not whole-object equality, so the new key is safe; confirm with `npm run test:contract`.

```bash
git add drizzle/schema.ts drizzle/migrations src/lib/schemas/structure.ts src/server/services/structure.ts src/server/fixtures/demo.ts tests/integration/structure.test.ts
git commit -m "feat: due dates on projects and jobs"
```

### Task 1.2: due-date lib + tree UI

**Files:**
- Create: `src/lib/dueDates.ts`, `tests/unit/dueDates.test.ts`
- Modify: `src/components/structureTree.tsx`

**Interfaces:**
- `export type DueStatus = 'none' | 'ok' | 'soon' | 'overdue'`
- `export function dueStatus(dueOn: string | null, todayIso: string, soonDays = 7): DueStatus`
- `export function jobDueAfterProject(jobDueOn: string | null, projectDueOn: string | null): boolean`

- [ ] **Step 1: Failing unit tests**

```ts
import { describe, expect, it } from 'vitest'
import { dueStatus, jobDueAfterProject } from '~/lib/dueDates'

describe('dueStatus', () => {
  it('none without a date', () => expect(dueStatus(null, '2026-09-05')).toBe('none'))
  it('overdue strictly before today', () => expect(dueStatus('2026-09-04', '2026-09-05')).toBe('overdue'))
  it('today is soon, not overdue', () => expect(dueStatus('2026-09-05', '2026-09-05')).toBe('soon'))
  it('inside the window is soon', () => expect(dueStatus('2026-09-12', '2026-09-05')).toBe('soon'))
  it('outside the window is ok', () => expect(dueStatus('2026-09-13', '2026-09-05')).toBe('ok'))
  it('window is configurable', () => expect(dueStatus('2026-09-13', '2026-09-05', 10)).toBe('soon'))
})

describe('jobDueAfterProject', () => {
  it('flags a job due after its project', () => expect(jobDueAfterProject('2026-11-01', '2026-10-30')).toBe(true))
  it('never flags when either side is null', () => {
    expect(jobDueAfterProject(null, '2026-10-30')).toBe(false)
    expect(jobDueAfterProject('2026-11-01', null)).toBe(false)
  })
})
```

- [ ] **Step 2: Implement `src/lib/dueDates.ts`**

Pure string comparison on ISO dates (lexicographic order is chronological for `YYYY-MM-DD`); the window uses `addDays`/`toIsoDate`/`parseIsoDate` from `~/lib/dateShift`. No `Date` local-time methods (rule 6).

- [ ] **Step 3: Tree UI**

`src/components/structureTree.tsx`:
- `StructureTree` props gain `today: string` (callers: `admin/jobs.tsx`, `admin/projects.tsx`, `admin/clients.tsx`, `reports.tsx` admin panel — each already has `today` from `getTodayFn` or can fetch it; `reports.tsx` has `today` in loader data).
- `ProjectActions` and `JobRow` edit forms: `<input type="date" value={dueOn} onChange=… aria-label="Due date" />`; submit sends `dueOn: dueOn === '' ? null : dueOn`. `AddProjectForm` / `AddJobForm` likewise (blank → omit).
- Read rows: after the name, `<DueChip dueOn={node.dueOn} today={today} />` where `DueChip` renders `null` for `'none'`, else a `StatusChip` with `kind` `outline` (ok) / `inverse` (soon) / `error` (overdue) and text `Due {formatDate}`. Job rows additionally show `[data-tip="Due after its project"]` when `jobDueAfterProject(job.dueOn, project.dueOn)`.
- New copy: 'Due date', 'Due', 'Due after its project'.

- [ ] **Step 4: Verify + gate + commit**

`npx vitest run tests/unit/dueDates.test.ts` → PASS. `npm run check` → exit 0. Eyeball deferred if no browser.

```bash
git add src/lib/dueDates.ts tests/unit/dueDates.test.ts src/components/structureTree.tsx src/routes/_app/admin/jobs.tsx src/routes/_app/admin/projects.tsx src/routes/_app/admin/clients.tsx src/routes/_app/reports.tsx
git commit -m "feat: due date chips in the structure tree"
```

---

## Wave 2 · Assignment data and admin UI

### Task 2.1: `assignments` table + service

**Files:**
- Modify: `drizzle/schema.ts`, `drizzle/migrations/**` (generate)
- Create: `src/lib/schemas/assignments.ts`, `src/lib/allocation.ts`, `src/server/services/assignments.ts`, `src/server/fns/assignments.ts`
- Modify: `tests/integration/helpers.ts` (resetDb), `src/server/fixtures/demo.ts`
- Test: `tests/unit/allocation.test.ts`, `tests/integration/assignments.service.test.ts` (new)

**Interfaces:**
- Table `assignments { id, workerId → workers.id, targetKind: 'project'|'job', targetId, allocatedMinutes: integer | null, note, createdBy → workers.id, createdAt, updatedAt, archivedAt }`; unique partial index `assignments_worker_target` on `(workerId, targetKind, targetId) WHERE archived_at IS NULL`.
- `export type AssignmentView = { id: string; workerId: string; workerName: string; targetKind: 'project' | 'job'; targetId: string; targetName: string; projectId: string; clientId: string; allocatedMinutes: number | null; note: string | null; dueOn: string | null; createdAt: Date }`
- `listAssignments(deps, ctx, input: ListAssignmentsInput): Promise<AssignmentView[]>` — billing/admin: all; operator: `workerId` must be self or a supervisee (`assertCanViewWorker`), and omitting `workerId` returns self + supervisees.
- `createAssignment(deps, ctx, input: CreateAssignmentInput): Promise<{ id: string }>`, `updateAssignment`, `archiveAssignment` — admin only.
- `src/lib/allocation.ts`: `effectiveJobIds(assignments: { targetKind, targetId }[], structure: ClientNode[]): Set<string>` (project → its live jobs; job → itself).
- Fns: `listAssignmentsFn` (GET, `authMw`), `createAssignmentFn` / `updateAssignmentFn` / `archiveAssignmentFn` (POST, `authMw, requireRole('admin')`).

- [ ] **Step 1: Schema + migration**

`drizzle/schema.ts`, after the `jobs` block:

```ts
// ---- Assignments: who is expected to work on what, with an optional hours cap ----
export const assignments = sqliteTable(
  'assignments',
  {
    id: text('id').primaryKey(),
    workerId: text('worker_id').notNull().references(() => workers.id),
    targetKind: text('target_kind', { enum: ['project', 'job'] }).notNull(),
    targetId: text('target_id').notNull(), // projects.id or jobs.id by targetKind (app-enforced)
    allocatedMinutes: integer('allocated_minutes'), // null = no cap; never money
    note: text('note'),
    createdBy: text('created_by').notNull().references(() => workers.id),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
    archivedAt: ts('archived_at'),
  },
  (t) => [uniqueIndex('assignments_worker_target').on(t.workerId, t.targetKind, t.targetId).where(sql`${t.archivedAt} IS NULL`)],
)
```

```bash
npm run db:generate && npm run db:migrate:local
```

`tests/integration/helpers.ts` `resetDb`: add `db.delete(schema.assignments)` before `db.delete(schema.intervals)`.

- [ ] **Step 2: Schemas**

`src/lib/schemas/assignments.ts`:

```ts
import { z } from 'zod'

const target = { targetKind: z.enum(['project', 'job']), targetId: z.string().min(1) }
const allocatedMinutes = z.number().int().min(0).max(100_000).nullish()

export const CreateAssignmentInput = z.object({ workerId: z.string().min(1), ...target, allocatedMinutes, note: z.string().max(500).nullish() })
export const UpdateAssignmentInput = z.object({ id: z.string().min(1), allocatedMinutes, note: z.string().max(500).nullish() })
export const ArchiveAssignmentInput = z.object({ id: z.string().min(1) })
export const ListAssignmentsInput = z.object({ workerId: z.string().min(1).optional(), projectId: z.string().min(1).optional(), jobId: z.string().min(1).optional() })

export type CreateAssignmentInput = z.infer<typeof CreateAssignmentInput>
export type UpdateAssignmentInput = z.infer<typeof UpdateAssignmentInput>
export type ArchiveAssignmentInput = z.infer<typeof ArchiveAssignmentInput>
export type ListAssignmentsInput = z.infer<typeof ListAssignmentsInput>
```

- [ ] **Step 3: Failing tests**

`tests/unit/allocation.test.ts`: a three-job structure fixture; project assignment expands to its two live jobs and excludes an archived job; job assignment yields itself; union dedupes.

`tests/integration/assignments.service.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { asUser, deps, resetDb } from './helpers'
import { ids } from '~/server/fixtures/demo'
import { archiveAssignment, createAssignment, listAssignments, updateAssignment } from '~/server/services/assignments'
import { archiveJob } from '~/server/services/structure'

beforeEach(resetDb)

describe('assignments', () => {
  it('seed: opWorker→p1, Atlas→j1, Beacon→j3', async () => {
    const all = await listAssignments(deps(), asUser('billing'), {})
    expect(all.map((a) => [a.workerId, a.targetKind, a.targetId]).sort()).toEqual(
      [[ids.opWorker, 'project', ids.p1], [ids.agent1, 'job', ids.j1], [ids.agent2, 'job', ids.j3]].sort(),
    )
    expect(all.find((a) => a.targetId === ids.j1)!.dueOn).toBe('2026-09-08')
  })

  it('admin only for writes', async () => {
    const input = { workerId: ids.billingWorker, targetKind: 'job' as const, targetId: ids.j2 }
    await expect(createAssignment(deps(), asUser('billing'), input)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
    await expect(createAssignment(deps(), asUser('operator'), input)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })

  it('duplicate live assignment is a coded 409; archive then re-create is allowed', async () => {
    const dup = { workerId: ids.agent1, targetKind: 'job' as const, targetId: ids.j1 }
    await expect(createAssignment(deps(), asUser('admin'), dup)).rejects.toMatchObject({ status: 409, code: 'ASSIGNMENT_EXISTS' })
    const existing = (await listAssignments(deps(), asUser('admin'), { workerId: ids.agent1 }))[0]!
    await archiveAssignment(deps(), asUser('admin'), { id: existing.id })
    expect(await listAssignments(deps(), asUser('admin'), { workerId: ids.agent1 })).toEqual([])
    const { id } = await createAssignment(deps(), asUser('admin'), dup)
    expect(id).not.toBe(existing.id)
  })

  it('archived target is refused; missing target is 404 on targetId', async () => {
    await archiveJob(deps(), asUser('admin'), { id: ids.j4 })
    await expect(createAssignment(deps(), asUser('admin'), { workerId: ids.opWorker, targetKind: 'job', targetId: ids.j4 }))
      .rejects.toMatchObject({ status: 409, code: 'TARGET_ARCHIVED', field: 'targetId' })
    await expect(createAssignment(deps(), asUser('admin'), { workerId: ids.opWorker, targetKind: 'project', targetId: 'nope' }))
      .rejects.toMatchObject({ status: 404, code: 'NOT_FOUND', field: 'targetId' })
  })

  it('operators see self + supervisees only', async () => {
    const mine = await listAssignments(deps(), asUser('operator'), {})
    expect(mine.map((a) => a.workerId).sort()).toEqual([ids.opWorker, ids.agent1, ids.agent2].sort())
    await expect(listAssignments(deps(), asUser('operator'), { workerId: ids.billingWorker }))
      .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN_TARGET' })
  })

  it('update patches allocation and note; null clears', async () => {
    const a = (await listAssignments(deps(), asUser('admin'), { workerId: ids.agent2 }))[0]!
    await updateAssignment(deps(), asUser('admin'), { id: a.id, allocatedMinutes: 600 })
    expect((await listAssignments(deps(), asUser('admin'), { workerId: ids.agent2 }))[0]!.allocatedMinutes).toBe(600)
    await updateAssignment(deps(), asUser('admin'), { id: a.id, allocatedMinutes: null })
    expect((await listAssignments(deps(), asUser('admin'), { workerId: ids.agent2 }))[0]!.allocatedMinutes).toBeNull()
  })
})
```

- [ ] **Step 4: Run to verify it fails**

`npx vitest run tests/unit/allocation.test.ts tests/integration/assignments.service.test.ts` → FAIL.

- [ ] **Step 5: Implement**

`src/server/fixtures/demo.ts`: after jobs, insert three assignments (`asg-demo-1..3`, `createdBy: ids.adminWorker`, `createdAt: at(-7, 0)`), opWorker→p1 `allocatedMinutes: 2400`, agent1→j1 `1200`, agent2→j3 `null`.

`src/server/services/assignments.ts`:
- `requireAdmin` (copy the one-liner from `structure.ts`; do not export from there).
- `resolveTarget(db, kind, id)`: selects the project (with `clientId`, `dueOn`) or the job joined to its project; `NOT_FOUND` (`targetId`) if absent, `TARGET_ARCHIVED` (`targetId`) if `archivedAt` set.
- `createAssignment`: `requireAdmin`; worker must exist and be unarchived (`NOT_FOUND`, `workerId`); `resolveTarget`; pre-check the live duplicate and throw `ASSIGNMENT_EXISTS` with `data.conflictingId`; insert. Also wrap the insert to map a unique-constraint failure to the same error (the pre-check closes the common path, the catch closes the race).
- `listAssignments`: scope by role as in `scopeFor` in `reports.ts` (operator: `[ctx.workerId, ...ctx.superviseeWorkerIds]`, and `assertCanViewWorker` when `workerId` given); filter `archivedAt IS NULL`; join names (`workerNames` pattern from `approvals.ts`: `user.name` for humans via `humanWorkers`, `workers.name` for agents); resolve `targetName`, `projectId`, `clientId`, `dueOn` per kind (two queries, merged in memory). Sort by `workerName`, then `targetName`.
- `updateAssignment` / `archiveAssignment`: `requireAdmin`; `NOT_FOUND` (`id`) when missing or archived; `updatedAt: deps.now()`.

`src/lib/allocation.ts` `effectiveJobIds` as specified; imports `ClientNode` type from `~/server/services/structure` is NOT allowed (#20: `src/lib` never imports `~/server/*`). Define a minimal structural type locally: `{ projects: { id: string; jobs: { id: string; archivedAt: Date | null }[] }[] }[]`.

`src/server/fns/assignments.ts`: wrappers as in the Interfaces block; re-export `AssignmentView`.

- [ ] **Step 6: Verify + gate + commit**

`npx vitest run tests/unit/allocation.test.ts tests/integration/assignments.service.test.ts` → PASS. `npm run check` → exit 0.

```bash
git add drizzle/schema.ts drizzle/migrations src/lib/schemas/assignments.ts src/lib/allocation.ts src/server/services/assignments.ts src/server/fns/assignments.ts src/server/fixtures/demo.ts tests/integration/helpers.ts tests/unit/allocation.test.ts tests/integration/assignments.service.test.ts
git commit -m "feat: assignments table and service"
```

### Task 2.2: admin assignment UI

**Files:**
- Modify: `src/components/structureTree.tsx`, `src/routes/_app/admin/workers.tsx`, `src/routes/_app/admin/{jobs,projects}.tsx` (loaders), `src/styles/global.css`
- Test: (none required — UI over a tested service; gate via `npm run check`; eyeball deferred)

**Interfaces:**
- `StructureTree` props gain `assignments?: AssignmentView[]` and `workers?: { workerId: string; name: string; kind: 'human' | 'agent' }[]`. When both are present and `manage !== 'client'`, project and job rows render `AssignPills`.
- New component `src/components/assignPills.tsx`: `AssignPills({ targetKind, targetId, assignments, workers, run })` — pills of assigned names with an ✕ (calls `archiveAssignmentFn`), plus a `<select>` of unassigned workers whose change calls `createAssignmentFn`. Uses the existing `run` (`RunFn`) so errors surface where the tree already shows them.

- [ ] **Step 1: Wire loaders**

`admin/jobs.tsx` and `admin/projects.tsx`: `Promise.all([listStructureFn(...), listAssignmentsFn({ data: {} }), listWorkersFn()])`; pass both to `StructureTree`. `admin/clients.tsx` and the reports admin panel pass nothing new (read-only there).

- [ ] **Step 2: Tree rows**

In `ProjectActions` and `JobRow` read state, after the due chip: `<AssignPills … />`. Pills show `workerName`, agents get a `[data-tip="Agent"]` marker. Empty state text: 'Nobody assigned'.

- [ ] **Step 3: Worker roster**

`admin/workers.tsx`: loader adds `listAssignmentsFn({ data: {} })` and `listStructureFn(...)`; each row gets an 'Assignments' cell listing `targetName` with kind (`project` / `job`) and an 'Assign…' select of projects and jobs (grouped optgroups 'Projects' / 'Jobs'). Same fns.

- [ ] **Step 4: CSS**

`global.css`: `.assignpills { display: flex; flex-wrap: wrap; gap: var(--space-1); }` and `.assignpills select { … }` using tokens only.

New copy: 'Nobody assigned', 'Assign…', 'Assignments', 'Projects', 'Jobs', 'Unassign'.

- [ ] **Step 5: Gate + commit**

`npm run check` → exit 0.

```bash
git add src/components/structureTree.tsx src/components/assignPills.tsx src/routes/_app/admin/workers.tsx src/routes/_app/admin/jobs.tsx src/routes/_app/admin/projects.tsx src/styles/global.css
git commit -m "feat: assign people from the tree and the roster"
```

---

## Wave 3 · Hours allocation and consumption

### Task 3.1: hours input on assignments

**Files:**
- Modify: `src/components/assignPills.tsx`
- Test: (none — `updateAssignment` is covered in 2.1)

- [ ] **Step 1:** Each pill gains an hours field (`inputMode="decimal"`, placeholder 'h', blank = no cap). On blur, `updateAssignmentFn({ data: { id, allocatedMinutes: raw === '' ? null : Math.round(Number(raw) * 60) } })`. Validate `^\d+(\.\d{1,2})?$` client-side; otherwise show 'Enter hours like 8 or 7.5, or leave blank' inline. Display current allocation as `formatHmm(allocatedMinutes)` next to the name when set.

New copy: 'h', 'Enter hours like 8 or 7.5, or leave blank'.

- [ ] **Step 2:** `npm run check` → exit 0.

```bash
git add src/components/assignPills.tsx
git commit -m "feat: hours allocation on assignments"
```

### Task 3.2: allocation report + CSV

**Files:**
- Modify: `src/lib/allocation.ts` (add `pace`), `tests/unit/allocation.test.ts`
- Modify: `src/server/services/reports.ts` (`jobIds` filter, only if audit B3 has not landed)
- Create: `src/server/services/allocations.ts`, `src/server/fns/allocations.ts`
- Modify: `src/lib/schemas/reports.ts`, `src/server/services/exports.ts`, `src/routes/_app/reports.tsx`
- Test: `tests/integration/allocations.service.test.ts` (new), `tests/integration/exports.service.test.ts` (append)

**Interfaces:**
- `export type Pace = 'ahead' | 'on_track' | 'behind' | 'over' | 'n/a'`
- `export function pace(allocatedMinutes: number | null, loggedMinutes: number, startIso: string, dueOn: string | null, todayIso: string, tolerance = 0.1): Pace` — expected = allocated × elapsed/total (clamped 0..1); `over` when logged > allocated; `behind`/`ahead` when logged is more than `tolerance × allocated` below/above expected; `n/a` when allocated or dueOn is null or total ≤ 0.
- `export type AllocationRow = { assignmentId: string; workerId: string; workerName: string; workerKind: 'human' | 'agent'; targetKind: 'project' | 'job'; targetId: string; targetName: string; clientName: string; dueOn: string | null; allocatedMinutes: number | null; loggedMinutes: number; remainingMinutes: number | null; pace: Pace }`
- `allocationReport(deps, ctx, input: { workerId?: string }): Promise<AllocationRow[]>` — scope as `listAssignments`; logged = all-time wall-clock (`TimeRecon.wallClockMin`) of the worker's pieces on the assignment's effective job ids. Time only.
- `export const ALLOCATIONS_CSV_COLUMNS = ['worker','kind','target_kind','target','client','due_on','allocated_minutes','logged_minutes','remaining_minutes','pace'] as const`; `ExportCsvInput.view` gains `'allocations'`.

- [ ] **Step 1: Failing tests**

`tests/unit/allocation.test.ts` (append): `pace` cases — no allocation → `n/a`; no due date → `n/a`; halfway through the window with half logged → `on_track`; 10% logged at 80% elapsed → `behind`; logged > allocated → `over`; today after due with less than allocated → `behind`.

`tests/integration/allocations.service.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { asUser, deps, resetDb } from './helpers'
import { ids } from '~/server/fixtures/demo'
import { allocationReport } from '~/server/services/allocations'
import { reconciliation } from '~/server/services/reports'

beforeEach(resetDb)

describe('allocationReport', () => {
  it('project assignment rolls up every job under the project; job assignment is narrower', async () => {
    const rows = await allocationReport(deps(), asUser('billing'), {})
    const op = rows.find((r) => r.workerId === ids.opWorker)!
    // opWorker on p1 (j1 + j2): seeded day0 09–12 ∪ 10–11 = 180, day1 09–13 = 240, day2 14–18 = 240 → 660 wall min
    expect(op.loggedMinutes).toBe(660)
    expect(op.allocatedMinutes).toBe(2400)
    expect(op.remainingMinutes).toBe(1740)
    const atlas = rows.find((r) => r.workerId === ids.agent1)!
    expect(atlas.loggedMinutes).toBe(480) // seeded iv03 only
    expect(atlas.pace).not.toBe('n/a') // 1200 allocated, due 2026-09-08
    expect(rows.find((r) => r.workerId === ids.agent2)!.pace).toBe('n/a') // no allocation
  })

  it('never carries money', async () => {
    const rows = await allocationReport(deps(), asUser('admin'), {})
    expect(JSON.stringify(rows)).not.toMatch(/cents/i)
  })

  it('operators get self + supervisees only', async () => {
    const rows = await allocationReport(deps(), asUser('operator'), {})
    expect(rows.map((r) => r.workerId).sort()).toEqual([ids.opWorker, ids.agent1, ids.agent2].sort())
  })
})
```

If the 660 figure disagrees with `reconciliation` for `p1` scoped to opWorker, trust `reconciliation` and fix the test's arithmetic comment, not the service: both must use `recon().wallClockMin` over the same pieces.

`tests/integration/exports.service.test.ts` (append): billing export of `view: 'allocations'` has the header above and three data rows; operator → 403.

- [ ] **Step 2: Run to verify it fails**

`npx vitest run tests/unit/allocation.test.ts tests/integration/allocations.service.test.ts tests/integration/exports.service.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`src/server/services/reports.ts` `loadIntervalsInRange`: filter type gains `jobIds?: string[]`; `if (filter.jobIds && filter.jobIds.length > 0) conds.push(inArray(schema.intervals.jobId, filter.jobIds))`. `loadPieces` forwards `filter` already. (Skip if audit B3 already added it.)

`src/server/services/allocations.ts`:
- `listAssignments(deps, ctx, input)` for the scoped rows; `listStructure(deps, ctx, { includeArchived: true })` for expansion (archived jobs keep historical time, #H5 policy).
- For each assignment: `jobIds = [...effectiveJobIds([a], structure)]`; if empty → logged 0; else `recon(await loadPieces(deps, { from: '2000-01-01', to: '2100-01-01' }, { workerIds: [a.workerId], jobIds })).wallClockMin`. Sequential awaits are fine at this scale.
- `remainingMinutes = allocatedMinutes == null ? null : allocatedMinutes - logged` (may go negative; UI shows it red).
- `pace(a.allocatedMinutes, logged, localDateOf(a.createdAt.getTime(), tz), a.dueOn, localDateOf(deps.now().getTime(), tz))`.
- Never spread a `Recon`; pick `wallClockMin` explicitly.

`src/server/fns/allocations.ts`: `allocationReportFn` (GET, `authMw`, validator `z.object({ workerId: z.string().min(1).optional() })`).

`src/lib/schemas/reports.ts`: `view: z.enum(['intervals', 'daily', 'leave', 'allocations'])` (plus `'events'` if the audit plan landed).

`src/server/services/exports.ts`: `if (input.view === 'allocations')` branch before the daily fallthrough; rows from `allocationReport(deps, ctx, {})`; `pace` verbatim (data export, not UI copy). `exportCsv` already throws `FORBIDDEN` for non-money roles at the top; keep that.

`src/routes/_app/reports.tsx`:
- Billing sub-tab `'allocations'` ('Allocations'): table Worker / Target / Client / Due / Allocated / Logged / Remaining / Pace. Pace as `StatusChip`: `ahead`/`on_track` `success`, `behind` `error`, `over` `error`, `n/a` `muted`. Export button maps `sub === 'allocations'` → view `'allocations'`.
- Admin panel card 'Capacity': per worker Σ allocated vs Σ logged across live assignments, bar like `util-row`.
- Operator panel: section 'My assignments' with the same table minus Client, from `allocationReportFn({ data: {} })` (service scopes).
- New copy: 'Allocations', 'Target', 'Due', 'Allocated', 'Logged', 'Remaining', 'Pace', 'Capacity', 'My assignments', 'Ahead', 'On track', 'Behind', 'Over', '—'.

- [ ] **Step 4: Verify + gate + commit**

All three test files → PASS. `npm run check` → exit 0. `npm run test:contract` → green (`phase7-exports` compares the intervals/daily headers only).

```bash
git add src/lib/allocation.ts tests/unit/allocation.test.ts src/server/services/reports.ts src/server/services/allocations.ts src/server/fns/allocations.ts src/lib/schemas/reports.ts src/server/services/exports.ts src/routes/_app/reports.tsx tests/integration/allocations.service.test.ts tests/integration/exports.service.test.ts
git commit -m "feat: allocation report and csv"
```

---

## Wave 4 · Surfacing to the people doing the work

### Task 4.1: entry form + Today

**Files:**
- Modify: `src/routes/_app/today.tsx`, `src/components/entryForm.tsx`
- Test: (none — presentational; gate via `npm run check`)

- [ ] **Step 1:** `today.tsx` loader adds `listAssignmentsFn({ data: {} })` and `allocationReportFn({ data: {} })` to the `Promise.all`. Pass `assignments` to `EntryForm` and `allocations` to a new `AssignmentsStrip`.
- [ ] **Step 2:** `entryForm.tsx`: compute `assignedJobIds = effectiveJobIds(assignments.filter(a => a.workerId === selectedWorkerId), structure)`; render an `<optgroup label="Assigned">` ABOVE the existing `Recent` optgroup listing those jobs (`jobName · projectName`, plus ` · due {dueOn}` when set). Existing optgroups unchanged. Unassigned jobs remain selectable.
- [ ] **Step 3:** `AssignmentsStrip` (inline in `today.tsx` or `src/components/assignmentsStrip.tsx`): one line per row for the visible workers: `workerName · targetName · Due {dueOn} · {formatHmm(remaining)} left` with a pace chip. Hidden when empty.

New copy: 'Assigned', 'left', 'Assignments'.

- [ ] **Step 4:** `npm run check` → exit 0.

```bash
git add src/routes/_app/today.tsx src/components/entryForm.tsx src/components/assignmentsStrip.tsx
git commit -m "feat: assigned jobs first in the picker, assignments on today"
```

### Task 4.2: approver advisory

**Files:**
- Modify: `src/server/services/approvals.ts` (`WeekForApproval.unassignedIntervalIds: string[]`), `src/components/approverView.tsx`
- Test: `tests/integration/approvals.service.test.ts` (append; create if absent)

**Interfaces:**
- `WeekForApproval` gains `unassignedIntervalIds: string[]` — ids of this week's intervals whose `jobId` is outside the worker's effective job set. Empty when the worker has no assignments at all (nothing to compare against; avoids flagging every entry for unplanned workers).

- [ ] **Step 1: Failing test**

```ts
it('week view lists intervals on unassigned jobs when the worker has assignments', async () => {
  // opWorker is assigned to p1 (j1, j2); seeded iv06 (j3) and iv08 (j4) are outside it.
  const week = await getWeekForApproval(deps(), asUser('billing'), { workerId: ids.opWorker, weekStart: '2026-08-31' })
  expect(week.unassignedIntervalIds.sort()).toEqual(['demo-0000-iv-06', 'demo-0000-iv-08'])
  // billingWorker has no assignments → nothing flagged
  const bw = await getWeekForApproval(deps(), asUser('billing'), { workerId: ids.billingWorker, weekStart: '2026-08-31' })
  expect(bw.unassignedIntervalIds).toEqual([])
})
```

- [ ] **Step 2: Implement**

`approvals.ts` `getWeekForApproval`: after `intervals` are loaded, `const assigned = await listAssignments(deps, ctx, { workerId: input.workerId })` (visibility already asserted); if non-empty, `const jobIds = effectiveJobIds(assigned, await listStructure(deps, ctx, { includeArchived: true }))` and filter. This does not touch `redFlags` (Locked Decision 7).

`approverView.tsx`: under the Entries heading, when `week.unassignedIntervalIds.length > 0`: `<p className="status-msg">{n} entries on jobs this worker is not assigned to</p>`; those rows get `className="unassigned"` (CSS: subtle left border using `--color-warning` token if it exists, else `--color-info`).

New copy: 'entries on jobs this worker is not assigned to'.

- [ ] **Step 3:** Tests PASS; `npm run check` → exit 0; `phase6-approvals` contract compares `events` kinds and queue ids, not whole `WeekForApproval` objects — confirm with `npm run test:contract`.

```bash
git add src/server/services/approvals.ts src/components/approverView.tsx tests/integration/approvals.service.test.ts src/styles/global.css
git commit -m "feat: unassigned-entry advisory in the approver view"
```

---

## Wave 5 · Optional enforcement

### Task 5.1: `requireAssignment` setting

**Files:**
- Modify: `drizzle/schema.ts` (`orgSettings`), `drizzle/migrations/**` (generate), `src/lib/schemas/settings.ts`, `src/server/services/settings.ts`, `src/routes/_app/admin/settings.tsx`
- Test: `tests/integration/settings.service.test.ts` (append)

- [ ] **Step 1:** Schema: `requireAssignment: integer('require_assignment', { mode: 'boolean' }).notNull().default(false)`. Generate + apply.
- [ ] **Step 2:** Test: round-trips `true`/`false`; default `false` when the row is absent.
- [ ] **Step 3:** `OrgSettingsInput.requireAssignment: z.boolean().optional()`; `OrgSettingsView.requireAssignment: boolean`; `getOrgSettings` returns `row?.requireAssignment ?? false`; `updateOrgSettings` patches it; the `insert().values()` fallback literal includes `requireAssignment: false`.
- [ ] **Step 4:** Settings page: a `checkline` toggle. Copy: 'Require an assignment to log time', help 'When on, time can only be logged to jobs the worker is assigned to (directly or via the project). Admins are exempt. Agents need an assignment too.'
- [ ] **Step 5:** `npm run check` → exit 0.

```bash
git add drizzle/schema.ts drizzle/migrations src/lib/schemas/settings.ts src/server/services/settings.ts src/routes/_app/admin/settings.tsx tests/integration/settings.service.test.ts
git commit -m "feat: require-assignment org setting"
```

### Task 5.2: interval guard

**Files:**
- Modify: `src/server/services/intervals.ts`
- Test: `tests/integration/intervals.test.ts` (append)

**Interfaces:**
- Non-exported `assertAssigned(deps, ctx, workerId, jobId)`: no-op when the setting is off or `isAdmin(ctx)`; otherwise loads the worker's live assignments and the structure and throws `HttpError(403, 'NOT_ASSIGNED', 'jobId')` when `jobId ∉ effectiveJobIds`.
- Guard order (rule 3) becomes: `assertCanEditWorker → liveJob → assertAssigned → same-job overlap → assertWeeksEditable → write → resetSubmittedWeeks`. Applied in `createInterval` always and in `updateInterval` only when `jobChanged`.

- [ ] **Step 1: Failing tests**

`tests/integration/intervals.test.ts` (append; this file must now reset `org_settings` in `beforeEach` per Global Constraints):

```ts
describe('requireAssignment (#7 exception, default off)', () => {
  const onJ3 = { workerId: ids.opWorker, jobId: ids.j3, startedAt: iso(at(4, 9)), endedAt: iso(at(4, 10)) } // opWorker is assigned p1 only

  it('off by default: unassigned job accepted', async () => {
    await expect(createInterval(deps(), op, onJ3)).resolves.toBeTruthy()
  })

  it('on: refused on the job field; assigned job and admin still pass', async () => {
    await updateOrgSettings(deps(), asUser('admin'), { requireAssignment: true })
    await expect(createInterval(deps(), op, onJ3)).rejects.toMatchObject({ status: 403, code: 'NOT_ASSIGNED', field: 'jobId' })
    await expect(createInterval(deps(), op, { ...onJ3, jobId: ids.j2 })).resolves.toBeTruthy() // j2 ∈ p1
    await expect(createInterval(deps(), asUser('admin'), { ...onJ3, startedAt: iso(at(4, 11)), endedAt: iso(at(4, 12)) })).resolves.toBeTruthy()
  })

  it('on: judged by the target worker; supervisor logging for Atlas on j3 is refused, on j1 passes', async () => {
    await updateOrgSettings(deps(), asUser('admin'), { requireAssignment: true })
    const atlas = { workerId: ids.agent1, startedAt: iso(at(4, 9)), endedAt: iso(at(4, 10)) }
    await expect(createInterval(deps(), op, { ...atlas, jobId: ids.j3 })).rejects.toMatchObject({ code: 'NOT_ASSIGNED' })
    await expect(createInterval(deps(), op, { ...atlas, jobId: ids.j1 })).resolves.toBeTruthy()
  })

  it('on: job change to an unassigned job is refused; time-only edit is not re-checked', async () => {
    const iv = await createInterval(deps(), op, { ...onJ3, jobId: ids.j2 })
    await updateOrgSettings(deps(), asUser('admin'), { requireAssignment: true })
    await expect(updateInterval(deps(), op, { id: iv.id, jobId: ids.j3 })).rejects.toMatchObject({ code: 'NOT_ASSIGNED' })
    await expect(updateInterval(deps(), op, { id: iv.id, endedAt: iso(at(4, 10, 30)) })).resolves.toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails** → the "on" cases FAIL.

- [ ] **Step 3: Implement**

`intervals.ts`: import `getOrgSettings` from `./settings`, `listAssignments` from `./assignments`, `listStructure` from `./structure`, `effectiveJobIds` from `~/lib/allocation`, `isAdmin` from `~/server/context`. Add `assertAssigned` as specified; call it after `liveJob` in `createInterval`, and in `updateInterval` inside the `jobChanged` path after `liveJob`. No other signature or order changes.

- [ ] **Step 4: Verify + gate + commit**

`npx vitest run tests/integration/intervals.test.ts` → PASS. `npm run check` → exit 0. `npm run test:contract` → `phase4-intervals` unaffected because the default is off and the seeded row is `false`.

```bash
git add src/server/services/intervals.ts tests/integration/intervals.test.ts
git commit -m "feat: refuse unassigned time when the org requires assignments"
```

---

## Wave 6 · Describe the result

### Task 6.1: docs + final gate

- [ ] **Step 1:** `CLAUDE.md`:
  - Rule 3 guard order gains `assertAssigned` after the live job lookup, noting it is a no-op unless `requireAssignment` is on.
  - Rule 7 codes list gains `ASSIGNMENT_EXISTS` 409 (`data.conflictingId`), `TARGET_ARCHIVED` 409 (`targetId`), `NOT_ASSIGNED` 403 (`jobId`).
  - "Where things are" rows: `Due dates | src/lib/dueDates.ts`, `Assignments | src/lib/schemas/assignments.ts, src/server/services/assignments.ts, src/server/fns/assignments.ts`, `Allocation math + report | src/lib/allocation.ts, src/server/services/allocations.ts`, `Assignment UI | src/components/assignPills.tsx, src/components/assignmentsStrip.tsx`.
- [ ] **Step 2:** `npm run check && npm run test:contract && npm run build`; `git status` shows `src/routeTree.gen.ts` unchanged.
- [ ] **Step 3:**

```bash
git add CLAUDE.md
git commit -m "chore: assignments and allocation wrap-up"
```

---

## Done Criteria

- Projects and jobs carry a nullable `dueOn`; the tree shows Due / Due soon / Overdue chips and flags a job due after its project.
- `assignments` exists with a live-rows unique index; admin assigns and unassigns from the tree and the roster; operators list self + supervisees only; duplicates and archived targets are coded 409s that land on a field.
- Each assignment carries an optional `allocatedMinutes`; the allocation report shows logged (wall-clock union), remaining, and pace per assignment; CSV view `'allocations'` exports the same rows; nothing in the plan's types carries a `cents` key.
- The entry form lists assigned jobs first; Today shows remaining hours; the approver view counts entries on unassigned jobs without touching `redFlags`.
- `requireAssignment` defaults off and changes nothing; on, unassigned entries are refused with `NOT_ASSIGNED` on `jobId`, admin exempt, judged against the target worker.
- No new dependencies, no contract edits, no existing copy changed, `routeTree.gen.ts` unchanged, gates green.

## Sequencing

**Why this order.** Dates first because they are trivially additive and every later computation needs them. Assignments before hours because an allocation is a property of an assignment, and "who" has to settle before "how much". Reports before entry-form changes so the numbers are covered by integration tests before any pixel depends on them. Enforcement last, behind a default-off setting, because it is the one wave that takes an ability away from users and should only do so once they can see what they are assigned to and why an entry was refused.

**What can slip.** Waves 1–3 are the feature. Wave 4 can ship piecemeal (4.1's picker optgroup alone is most of the value). Wave 5 can slip indefinitely; with the setting off it changes nothing. Wave 6 is small but skipping it means the next agent re-derives the guard order from the code.
