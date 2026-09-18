# Clients & Projects Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clients and Projects leave the Admin section and become first-class pages: a searchable, filterable list each, and a detail page each. The client page holds contacts, address and notes alongside current and past work figures. The project page holds hours, overtime, money (billing/admin only), per-job and per-worker breakdowns, and a weekly trend, for live and archived projects alike. Admin structure actions (rename, archive, rates) move onto the detail pages as admin-only cards.

**Architecture:** Four waves. Wave 1 moves routing, adds server-side list/search/filter with cursor pagination, and adds the `clientId`/`projectId` filters the aggregates need. Wave 2 adds client contacts and the client pages. Wave 3 adds project aggregates (per job, per worker, weekly, overtime) and the project pages. Wave 4 cross-links from the rest of the app, adds CSV exports, and updates docs. Every figure is computed from intervals through the existing `loadPieces → recon` path; nothing is materialised.

**Tech Stack:** TanStack Start (createServerFn, file routes with `$param`), Drizzle (D1, `npm run db:generate`), zod v4, vitest (unit + integration), existing design system (`KpiTile`, `TrioChip`, `StatusChip`, `PeriodSelector`, `SubTabs`, `.recontable`, `.intervallist`).

## Global Constraints

- Node 24 via **nvm** (`.nvmrc`); the shell default is Node 21, so `export PATH=~/.nvm/versions/node/v24.19.0/bin:$PATH` before any npm/npx. Gate: `npm run check` exit 0. Belt-and-braces: `npm run test:contract`. `tsc` covers `tests/**`.
- `tests/contract/**` is untouchable. `phase4-structure.contract.test.ts` exercises `listStructure`/`createJob`/etc. directly; those signatures and outputs stay as they are (additive keys only where the contract matches by regex, not equality — check before adding).
- Migrations: `npm run db:generate`, never hand-edit. This plan needs two (Tasks 2.1 and, if the assignments plan has not landed, none else). Use the next free number; the audit and assignments plans may be ahead of you.
- No new dependencies.
- **Money (#5/#18):** operators never receive `cents`, `rateCents`, `billableRateCents`, or any key this plan adds ending in `Cents`. Build objects without the key. Money rounds once per displayed grouping via `moneyCents`. Minutes never round.
- **Time (#19/#22/#23):** durations are integer minutes; dates are org-tz `YYYY-MM-DD`; instants are `timestamp_ms` via `deps.now()`; day/week boundaries via `src/lib/dayMath.ts` / `src/lib/week.ts` with `deps.tz`.
- **Visibility (#5/#7):** the pages are visible to every role. Figures for operators are scoped like `reports.ts` `scopeFor` (self + supervisees) and carry no money. Contacts and address are not money and are visible to all roles (Locked Decision 2).
- **Search:** server-side, `LIKE` with `%`/`_` escaped (`src/lib/search.ts`), case-insensitive via `lower()`. Cursor pagination follows `listIntervals` (`cursor` string, `limit` default 50 max 200, `INVALID_CURSOR` 400).
- **Copy freeze:** existing user-visible strings stay byte-identical. Each task lists NEW copy.
- **Services (#10/#20):** `(deps, ctx, input)` in new service files (`clients.ts`, `projects.ts`); fns thin. Role checks in middleware AND service. `structure.ts` signatures are fixed; extend by new functions, not edits.
- **Errors (#25):** new codes: `CONTACT_NOT_FOUND` 404 (`id`). Reused: `NOT_FOUND`, `FORBIDDEN`, `INVALID_CURSOR`.
- **Never hard-delete:** contacts get `archivedAt`.
- **Routes:** four new file routes (`clients.tsx`, `clients.$clientId.tsx`, `projects.tsx`, `projects.$projectId.tsx`) and two deletions (`admin/clients.tsx`, `admin/projects.tsx`). `src/routeTree.gen.ts` churns; run `npm run build` BEFORE `npm run check` in those tasks and commit the generated file with the route change.
- **Org settings leak / seeded overlaps / fixed clock:** as in the sibling plans. Tests that touch `org_settings` reset it in `beforeEach`; new opWorker test intervals use day 4; order tie-prone queries by `rowid`.
- Test helpers and demo facts: `deps()` clock `2026-09-05` Perth; `asUser(role)`; `ids` (`c1` Acme Aerospace → `p1` Flight Ops Automation → `j1` $140 / `j2` $90; `c2` Nimbus Freight → `p2` Route Optimization → `j3` $120 / `j4` non-billable); seeded intervals days 0–3 for opWorker, agent1 (j1, 8h day 0), agent2 (j3, 3h day 0). Org `defaultDayMinutes` 480.
- **Coordination:** the audit plan (budgets, trends), the assignments plan (due dates, assignments) and this plan all touch `reports.tsx`, `structureTree.tsx`, `loadIntervalsInRange`, and the nav. Land them one at a time. Where this plan says "if landed", the feature is displayed when its data exists and skipped otherwise; no task here depends on the other plans.

## Locked Decisions

1. **Routes:** `/clients`, `/clients/$clientId`, `/projects`, `/projects/$projectId`. Nav gains 'Clients' and 'Projects' between 'Reports' and 'Approvals'. `/admin/clients` and `/admin/projects` are deleted; the admin sub-nav starts at 'Jobs'. Any link to the old paths is updated in the same commit.
2. **Contacts and address are visible to all roles.** They are not money. Editing them is admin-only (#5: admin owns structure).
3. **Structure actions live on the detail pages** as an admin-only 'Manage' card (rename, archive/unarchive, add project / add job, job rate). The `StructureTree` component stays for `/admin/jobs` and the reports admin panel; it is not deleted.
4. **"Past work" = archived entities plus any period the filter selects.** Lists default to `status: 'active'`; a 'Show archived' filter and an 'Archived' chip cover the past. Detail pages of archived entities render read-only with an 'Archived on …' banner and an admin 'Unarchive' action.
5. **"Costs" means billable value** at the interval's snapshot rate (`Σ minutes × rateCents / 60`, rounded once). There is no cost-rate concept in the data model; a future `positions.costRateCents` is out of scope and noted in Wave 4 docs.
6. **Overtime is per worker per local day:** wall-clock minutes above `defaultDayMinutes`, attributed to a project pro-rata by that worker's effort on the project that day. Pure function in `src/lib/overtime.ts`. Minutes only; visible to all roles within their scope. Weekend days count like weekdays (no calendar concept exists yet).
7. **List rows carry cheap SQL aggregates** (effort minutes = Σ(ended−started), last activity = max(startedAt), billable cents = Σ(minutes×rateCents)/60 rounded once, money-gated). Wall-clock union and premium need day-splitting and appear only on detail pages via `loadPieces → recon`.
8. **Search matches:** clients by name, contact name, contact email; projects by name and client name. One `q` box per page; filters are URL search params so pages are shareable.
9. **Period on detail pages** defaults to 'All time' (a new `PeriodSelector` preset); 'This week', 'Last week', 'This month', custom stay available.
10. **Invoices stay computed on demand.** The client page links to `/invoice?clientId&from&to` for the selected period; no invoice table is added.

**Decision impact to record in `.wayfinder` (read-only here):** #11's three-tab reporting design gains two entity-centric pages that reuse its trio-everywhere signature. #5 gains `edit_client_contacts` (admin) and `view_client_contacts` (all). #4's `clients` table gains contact/address columns and a `client_contacts` child table.

## Feature → Task Map

| Feature | Task |
|---|---|
| Pages out of Admin, nav, route skeletons | 1.1 |
| Client & project lists with search/filter/paging | 1.2 (service) + 1.3 (UI) |
| Client/project filters for aggregates | 1.2 |
| Client contacts, address, notes | 2.1 (schema + service) + 2.2 (UI) |
| Client detail figures (current + past) | 2.3 |
| Project aggregates (hours, overtime, costs, per job, per worker, weekly) | 3.1 (lib) + 3.2 (service) |
| Project detail page | 3.3 |
| Cross-links, CSV, docs | 4.1, 4.2 |

## File Structure

| File | Responsibility |
|---|---|
| `src/routes/_app/{clients,clients.$clientId,projects,projects.$projectId}.tsx` (new) | pages |
| `src/routes/_app/admin/{clients,projects}.tsx` | deleted |
| `src/routes/_app/admin/route.tsx`, `src/routes/_app/route.tsx` | nav |
| `src/lib/search.ts` (new) | `likePattern`, `parseCursor`/`makeCursor` for (sortKey, id) cursors |
| `src/lib/overtime.ts` (new) | `overtimeByProject` |
| `src/lib/schemas/clients.ts`, `src/lib/schemas/projects.ts` (new) | list/detail/contact inputs |
| `src/server/services/clients.ts`, `src/server/services/projects.ts` (new) | list, detail, contacts |
| `src/server/services/reports.ts` | `clientId` already exists; add `projectId` to `loadIntervalsInRange` filter |
| `src/server/services/exports.ts`, `src/lib/schemas/reports.ts` | `'client'` / `'project'` CSV views (Wave 4) |
| `src/server/fns/{clients,projects}.ts` (new) | wrappers |
| `src/components/{entityList,contactsCard,manageCard,workerBreakdown,weeklyTrendTable}.tsx` (new) | UI pieces |
| `src/components/periodSelector.tsx` | `'allTime'` preset |
| `drizzle/schema.ts`, `drizzle/migrations/**` | client columns + `client_contacts` |
| `src/server/fixtures/demo.ts` | contacts, address, one archived project with history |
| `tests/unit/{search,overtime}.test.ts`, `tests/integration/{clients.service,projects.service,exports.service}.test.ts` | tests |

---

## Wave 1 · Move the pages and build the list machinery

### Task 1.1: routes, nav, and admin sub-nav

**Files:**
- Create: `src/routes/_app/clients.tsx`, `src/routes/_app/clients.$clientId.tsx`, `src/routes/_app/projects.tsx`, `src/routes/_app/projects.$projectId.tsx` (skeletons: heading + 'Coming soon' placeholder is NOT acceptable; render the existing `StructureTree` read-only as the interim body so the pages are useful from the first commit)
- Delete: `src/routes/_app/admin/clients.tsx`, `src/routes/_app/admin/projects.tsx`
- Modify: `src/routes/_app/admin/route.tsx`, `src/routes/_app/route.tsx`, `src/routeTree.gen.ts` (generated)

- [ ] **Step 1:** Create the four routes. List pages: `loader` → `listStructureFn({ data: { includeArchived: false } })`, body = `<StructureTree manage="client" … />` filtered to the relevant level (interim). Detail pages: `loader` reads `params.clientId` / `params.projectId`, finds the node in the tree, throws `notFound()` when absent, renders name + children (interim).
- [ ] **Step 2:** `_app/route.tsx` nav: add `<Link to="/clients">` and `<Link to="/projects">` after Reports, icons `Buildings` and `Folder` from `reicon-react` (verify exports; fall back to `Briefcase`). New copy: 'Clients', 'Projects' (nav; the admin sub-nav strings of the same text are removed, so net copy is unchanged for those two words but they now live in a different component — record as moved, not new).
- [ ] **Step 3:** `admin/route.tsx`: remove the Clients and Projects links. Grep for `/admin/clients` and `/admin/projects` (`_app/route.tsx` Admin link points at `/admin/clients`) and repoint to `/admin/jobs`.
- [ ] **Step 4:** `npm run build` (regenerates `routeTree.gen.ts`), then `npm run check` → exit 0.

```bash
git add src/routes/_app/clients.tsx 'src/routes/_app/clients.$clientId.tsx' src/routes/_app/projects.tsx 'src/routes/_app/projects.$projectId.tsx' src/routes/_app/admin/route.tsx src/routes/_app/route.tsx src/routeTree.gen.ts
git rm src/routes/_app/admin/clients.tsx src/routes/_app/admin/projects.tsx
git commit -m "feat: clients and projects pages out of admin"
```

### Task 1.2: list services with search, filter, paging

**Files:**
- Create: `src/lib/search.ts`, `tests/unit/search.test.ts`, `src/lib/schemas/clients.ts`, `src/lib/schemas/projects.ts`, `src/server/services/clients.ts`, `src/server/services/projects.ts`, `src/server/fns/clients.ts`, `src/server/fns/projects.ts`
- Modify: `src/server/services/reports.ts` (`projectId` filter)
- Test: `tests/integration/clients.service.test.ts`, `tests/integration/projects.service.test.ts` (new)

**Interfaces:**

```ts
// src/lib/schemas/clients.ts
export const ListClientsInput = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(['active', 'archived', 'all']).default('active'),
  activeSince: z.iso.date().optional(),           // has an interval starting on/after this day
  sort: z.enum(['name', 'lastActivity', 'effort']).default('name'),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
})
// src/lib/schemas/projects.ts
export const ListProjectsInput = ListClientsInput.extend({
  clientId: z.string().min(1).optional(),
  due: z.enum(['overdue', 'soon', 'none', 'any']).default('any'), // only meaningful if the assignments plan landed; otherwise 'any'
})
```

```ts
export type ClientListRow = {
  id: string; name: string; archivedAt: Date | null
  projectCount: number; liveProjectCount: number
  effortMin: number                 // Σ(ended−started) all-time, no union
  lastActivityMs: number | null
  billableCents?: number            // money viewers only
  primaryContact?: { name: string; email: string | null }  // Wave 2 fills this
}
export type ProjectListRow = {
  id: string; name: string; archivedAt: Date | null
  clientId: string; clientName: string
  jobCount: number; liveJobCount: number
  effortMin: number; lastActivityMs: number | null
  dueOn?: string | null             // if assignments plan landed
  billableCents?: number
}
export type Page<T> = { rows: T[]; nextCursor: string | null }
export async function listClients(deps, ctx, input: ListClientsInput): Promise<Page<ClientListRow>>
export async function listProjects(deps, ctx, input: ListProjectsInput): Promise<Page<ProjectListRow>>
```

- [ ] **Step 1: `src/lib/search.ts` + unit tests**

`likePattern(q: string): string` → `%${escaped}%` with `\` as escape char (escape `\`, `%`, `_`); callers use `sql\`lower(${col}) LIKE ${pattern} ESCAPE '\\'\``. `makeCursor(sortValue: string | number | null, id: string)` / `parseCursor(cursor)` → `{ sortValue, id }` or throw `HttpError(400, 'INVALID_CURSOR', 'cursor')`. Tests: escaping, round-trip, malformed cursor throws.

- [ ] **Step 2: failing integration tests**

`clients.service.test.ts`:
- default lists both seeded clients sorted by name, `nextCursor` null;
- `q: 'acme'` → only `c1`; `q: 'nim'` → only `c2`; `q: '%'` → none (escaped);
- `status: 'archived'` after archiving `c2` → only `c2`; `'all'` → both;
- `effortMin` for `c1` equals Σ of seeded intervals on `j1`+`j2` (opWorker 180+60+240+240, agent1 480 → 1200); `lastActivityMs` = `at(2, 14)` (iv07);
- billing sees `billableCents`; operator does not have the key and `effortMin` is scoped to self + supervisees (opWorker + agents; here identical to all, so add a billingWorker interval via `createInterval` on `j1` day 4 and assert operator's `effortMin` excludes it);
- `limit: 1` → `nextCursor` set; second call returns the other client; `cursor: 'garbage'` → `INVALID_CURSOR`.

`projects.service.test.ts`: same shape; `clientId` filter; `sort: 'effort'` orders `p1` before `p2`; archived project appears only under `status: 'archived' | 'all'`.

- [ ] **Step 3: implement**

`clients.ts` / `projects.ts`:
- One aggregate query per list: `intervals` joined to `jobs` (and `projects`), `deleted_at IS NULL`, optional `worker_id IN (scope)`, grouped by client (or project): `sum((ended_at - started_at) / 60000)` as `effortMin`, `max(started_at)` as `lastActivityMs`, `sum(((ended_at - started_at) / 60000) * coalesce(rate_cents, 0))` as `minuteCents`. `billableCents = Math.round(minuteCents / 60)` in app, once per row (#18). Timestamps are integer ms in D1, so arithmetic in SQL is exact.
- Entity query: `clients` (or `projects` joined to `clients`) with `status` filter, `q` via `likePattern` against `lower(name)` (Wave 2 extends the client match to contacts), counts via correlated sub-selects, sorted by `(sortKey, id)` and keyset-paged from `parseCursor`. `activeSince` filters on `lastActivityMs >= startMs(activeSince)`.
- Merge aggregates into rows in memory; omit `billableCents` unless `canSeeMoney(ctx)`.
- `reports.ts` `loadIntervalsInRange`: add `projectId?: string` to the filter type, `eq(schema.projects.projectId? …)` — the join to `projects` already exists there, so `conds.push(eq(schema.jobs.projectId, filter.projectId))`.

Fns: `listClientsFn`, `listProjectsFn` (GET, `authMw`).

- [ ] **Step 4:** tests PASS; `npm run check` → exit 0.

```bash
git add src/lib/search.ts tests/unit/search.test.ts src/lib/schemas/clients.ts src/lib/schemas/projects.ts src/server/services/clients.ts src/server/services/projects.ts src/server/fns/clients.ts src/server/fns/projects.ts src/server/services/reports.ts tests/integration/clients.service.test.ts tests/integration/projects.service.test.ts
git commit -m "feat: client and project lists with search, filters, paging"
```

### Task 1.3: list pages

**Files:**
- Create: `src/components/entityList.tsx`
- Modify: `src/routes/_app/clients.tsx`, `src/routes/_app/projects.tsx`, `src/styles/global.css`

- [ ] **Step 1:** `EntityList` is a generic table shell: search box (debounced 250 ms → URL `q`), filter chips (`status`, plus page-specific), sort select, 'Load more' button that appends the next page (keeps rows in component state keyed by cursor). Rows are links to the detail page. Columns: Name · Status chip · Projects/Jobs count · Effort (`formatHmm`) · Last activity (`localDateTimeOf`) · Billable (money viewers; `formatCents`).
- [ ] **Step 2:** `clients.tsx` / `projects.tsx`: `validateSearch` = the list input minus `cursor`/`limit`; `loaderDeps` mirrors it; loader calls the list fn with the first page. `projects.tsx` adds a client filter select (from `listClientsFn` with `limit: 200`).
- [ ] **Step 3:** CSS: `.entitylist-head` (flex, gap tokens), `.entitylist table` reuses `.recontable` rules; `.entitylist .loadmore` centred.
- New copy: 'Search clients', 'Search projects', 'Active', 'Archived', 'All', 'Sort', 'Name', 'Last activity', 'Effort', 'Billable', 'Load more', 'No clients match', 'No projects match', 'Client'.
- [ ] **Step 4:** `npm run check` → exit 0.

```bash
git add src/components/entityList.tsx src/routes/_app/clients.tsx src/routes/_app/projects.tsx src/styles/global.css
git commit -m "feat: searchable client and project lists"
```

---

## Wave 2 · Clients: contacts and the detail page

### Task 2.1: client contact data

**Files:**
- Modify: `drizzle/schema.ts` (`clients` columns + `clientContacts`), `drizzle/migrations/**` (generate)
- Modify: `src/lib/schemas/clients.ts`, `src/server/services/clients.ts`, `src/server/fns/clients.ts`, `src/server/fixtures/demo.ts`, `tests/integration/helpers.ts`
- Test: `tests/integration/clients.service.test.ts` (append)

**Interfaces:**
- `clients` gains `email`, `phone`, `website`, `addressLine1`, `addressLine2`, `city`, `region`, `postcode`, `country`, `notes` (all nullable text). Structured address so exports and invoices can format it later.
- Table `client_contacts { id, clientId → clients.id, name, role, email, phone, isPrimary: boolean default false, notes, createdAt, updatedAt, archivedAt }`.
- `UpdateClientDetailsInput` (admin): `id` + all the nullable client fields (`z.string().max(n).nullish()`; `email: z.email().nullish()`; `website: z.url().nullish()`).
- `CreateContactInput`, `UpdateContactInput`, `ArchiveContactInput`, `SetPrimaryContactInput`.
- `getClient(deps, ctx, { id }): Promise<ClientDetail>` where `ClientDetail = ClientListRow & { email…notes fields; contacts: ContactView[]; projects: ProjectListRow[] }` (projects scoped and money-gated like the list).
- Writes admin-only (`FORBIDDEN`); `CONTACT_NOT_FOUND` 404 (`id`); setting primary clears the previous primary in one `batch`.

- [ ] **Step 1:** schema + migration; `resetDb` deletes `clientContacts` before `clients`.
- [ ] **Step 2:** failing tests: admin sets address and two contacts; primary switch is exclusive; archive hides a contact; operator can read contacts but gets 403 on write; `listClients({ q: 'jane' })` finds `c1` by contact name and by email domain (Locked Decision 8).
- [ ] **Step 3:** implement; extend the `q` match in `listClients` with an `EXISTS` sub-select over live contacts. Fixture: `c1` gets an address in Perth, contacts 'Jane Okafor' (Ops lead, primary) and 'Sam Reyes' (Finance); `c2` gets one contact.
- [ ] **Step 4:** tests PASS; `npm run check` → exit 0.

```bash
git add drizzle/schema.ts drizzle/migrations src/lib/schemas/clients.ts src/server/services/clients.ts src/server/fns/clients.ts src/server/fixtures/demo.ts tests/integration/helpers.ts tests/integration/clients.service.test.ts
git commit -m "feat: client contacts, address and notes"
```

### Task 2.2: contacts and manage cards

**Files:**
- Create: `src/components/contactsCard.tsx`, `src/components/manageCard.tsx`
- Modify: `src/routes/_app/clients.$clientId.tsx`

- [ ] **Step 1:** `ContactsCard`: read view for everyone (primary first, `mailto:`/`tel:` links, role); admin gets add/edit/archive/set-primary inline, `@tanstack/react-form` + `applyServerError`. Address block and notes render under the contacts with an admin 'Edit details' form using `UpdateClientDetailsInput`.
- [ ] **Step 2:** `ManageCard` (admin only): rename (reuses `updateClientFn`), archive/unarchive (`archiveClientFn`; unarchive needs a new admin fn `unarchiveClientFn` → `structure.ts` gains `unarchiveClient`/`unarchiveProject`/`unarchiveJob` as NEW exported functions, allowed by rule 10), 'Add project' form (`createProjectFn`). The same component takes a `kind: 'client' | 'project'` prop for Wave 3.
- [ ] **Step 3:** Detail route: header (name, status chip, 'Archived on …' banner when archived), two-column layout: left `ContactsCard`, right figures (Task 2.3). `ManageCard` at the bottom for admins.
- New copy: 'Contacts', 'Primary', 'Make primary', 'Add contact', 'Role', 'Email', 'Phone', 'Address', 'Website', 'Notes', 'Edit details', 'Manage', 'Rename', 'Archive', 'Unarchive', 'Archived on', 'Add project'.
- [ ] **Step 4:** `npm run check` → exit 0. Integration test for `unarchiveClient` (admin only; clears `archivedAt`) appended to `structure.test.ts`.

```bash
git add src/components/contactsCard.tsx src/components/manageCard.tsx 'src/routes/_app/clients.$clientId.tsx' src/server/services/structure.ts src/server/fns/structure.ts src/lib/schemas/structure.ts tests/integration/structure.test.ts
git commit -m "feat: client detail contacts and manage cards"
```

### Task 2.3: client figures, current and past

**Files:**
- Modify: `src/server/services/clients.ts`, `src/server/fns/clients.ts`, `src/components/periodSelector.tsx`, `src/routes/_app/clients.$clientId.tsx`
- Test: `tests/integration/clients.service.test.ts` (append)

**Interfaces:**
- `clientFigures(deps, ctx, { id, from?, to? }): Promise<ClientFigures>` with

```ts
export type ClientFigures = {
  period: RoleRecon                        // trio (+cents for money viewers) over the selected period
  allTime: RoleRecon
  byProject: (ProjectListRow & { period: RoleRecon })[]   // live and archived
  byWorker: { workerId: string; name: string; kind: 'human' | 'agent'; period: TimeRecon & { cents?: number } }[]
  weeks: { weekStart: string; recon: RoleRecon }[]         // Mondays covering the period, oldest first
  recent: { id: string; workerName: string; jobName: string; startedAt: Date; endedAt: Date }[]  // last 20 intervals
}
```

- Built from `loadPieces(deps, period, { clientId, ...scopeFor(ctx) })` and `recon`; weeks via `isoWeekStart`/`weekDates`. `from`/`to` omitted = all time (`'2000-01-01'`..`'2100-01-01'`).
- `PeriodSelector` gains preset `'allTime'` (label 'All time'); `activePreset` returns it for that sentinel range. Existing labels unchanged.

- [ ] **Step 1:** failing tests: `c1` all-time `allTime.effortMin` 1200, `wallClockMin` 1140 (opWorker day-0 union 180 not 240), `premiumMin` 60; `byProject` has `p1` only; `byWorker` has three; operator: no `cents` anywhere (`JSON.stringify` regex) and `byWorker` scoped; archived project still appears in `byProject`.
- [ ] **Step 2:** implement; the route's `validateSearch` carries `from`/`to`; KPI strip (`KpiTile`): Effort, Wall clock, Overlap, Billable (money), Projects (live/total), Last activity. Sections: 'Projects' table (links to project pages), 'People' table, 'Weekly' table, 'Recent entries' list, 'Invoice for this period' link to `/invoice` (money viewers).
- New copy: 'All time', 'People', 'Weekly', 'Recent entries', 'Invoice for this period', 'live'.
- [ ] **Step 3:** tests PASS; `npm run check` → exit 0.

```bash
git add src/server/services/clients.ts src/server/fns/clients.ts src/components/periodSelector.tsx 'src/routes/_app/clients.$clientId.tsx' tests/integration/clients.service.test.ts
git commit -m "feat: client detail figures"
```

---

## Wave 3 · Projects: aggregates and the detail page

### Task 3.1: overtime math

**Files:**
- Create: `src/lib/overtime.ts`, `tests/unit/overtime.test.ts`

**Interfaces:**

```ts
export type OvertimeRow = { workerId: string; day: string; wallClockMin: number; overtimeMin: number; attributedMin: number }
/** Per worker-day wall-clock above dayMinutes, attributed to `projectJobIds` pro-rata by that worker's effort on those jobs that day. */
export function overtimeByProject(pieces: Piece[], projectJobIds: Set<string>, dayMinutes: number): OvertimeRow[]
export function totalOvertimeMin(rows: OvertimeRow[]): number
```

- `pieces` must include ALL of the worker's pieces for the days in question (not only the project's), otherwise a worker split across projects shows no overtime. The service passes unfiltered-by-project pieces and filters by job inside.
- Wall-clock per worker-day via `mergeRanges` (same as `redFlags.wallMinByDay`). `overtimeMin = max(0, wall − dayMinutes)`. `attributedMin = round(overtimeMin × projectEffort / totalEffort)` where efforts are summed piece minutes that day. Minutes never round except that single attribution step; document it.

- [ ] **Step 1:** unit tests: 10h single project → 120 overtime all attributed; 6h + 6h across two projects → 240 overtime, 120 each; overlapping jobs 9–17 on two projects (wall 480) → 0; agent 24h day → 960.
- [ ] **Step 2:** implement; `npm run check`.

```bash
git add src/lib/overtime.ts tests/unit/overtime.test.ts
git commit -m "feat: overtime attribution math"
```

### Task 3.2: project figures

**Files:**
- Modify: `src/server/services/projects.ts`, `src/server/fns/projects.ts`
- Test: `tests/integration/projects.service.test.ts` (append)

**Interfaces:**

```ts
export type ProjectFigures = {
  period: RoleRecon
  allTime: RoleRecon
  overtimeMin: number                                   // Locked Decision 6, period-scoped
  byJob: { jobId: string; jobName: string; archivedAt: Date | null; billableRateCents?: number | null; period: RoleRecon }[]
  byWorker: { workerId: string; name: string; kind: 'human' | 'agent'; period: RoleRecon; overtimeMin: number }[]
  weeks: { weekStart: string; recon: RoleRecon; overtimeMin: number }[]
  recent: { id: string; workerName: string; jobName: string; startedAt: Date; endedAt: Date }[]
  budgetCents?: number | null; consumedCents?: number   // only if the audit plan's budgets landed and viewer sees money
  dueOn?: string | null; assigned?: { workerId: string; name: string; allocatedMinutes: number | null }[]  // only if the assignments plan landed
}
export async function getProject(deps, ctx, { id }): Promise<ProjectDetail>   // ProjectListRow & { client: { id; name }; jobs: JobNode[] }
export async function projectFigures(deps, ctx, { id, from?, to? }): Promise<ProjectFigures>
```

- Pieces: `projectPieces = loadPieces(deps, period, { projectId, ...scope })`; for overtime, `allPieces = loadPieces(deps, period, { workerIds: [...workers present in projectPieces] })` then `overtimeByProject(allPieces, jobIdsOfProject, settings.defaultDayMinutes)`.
- `byJob.billableRateCents` only for money viewers (omit-key).

- [ ] **Step 1:** failing tests: `p1` all-time effort 1200 / wall 1140 / premium 60; `byJob` two rows; agent1's 8h day-0 on `j1` → `overtimeMin` 0 at 480 default; set `defaultDayMinutes: 360` via `updateOrgSettings` (this test file now resets `org_settings` in `beforeEach`) → agent1 overtime 120 attributed fully to `p1`; operator gets no `cents`/`billableRateCents`.
- [ ] **Step 2:** implement; tests PASS; `npm run check`.

```bash
git add src/server/services/projects.ts src/server/fns/projects.ts tests/integration/projects.service.test.ts
git commit -m "feat: project figures with overtime"
```

### Task 3.3: project detail page

**Files:**
- Create: `src/components/workerBreakdown.tsx`, `src/components/weeklyTrendTable.tsx`
- Modify: `src/routes/_app/projects.$projectId.tsx`, `src/components/manageCard.tsx` (kind `'project'`: rename, archive/unarchive, add job with rate for money viewers, job rate edit)

- [ ] **Step 1:** Header: client link (`/clients/$clientId`), name, status chip, due chip if `dueOn` present, 'Archived on …' banner. `PeriodSelector` with 'All time' default.
- [ ] **Step 2:** KPI strip: Effort, Wall clock, Overlap, Overtime, Billable (money), Budget used (money, only when `budgetCents` present). Sections: 'Jobs' (`.recontable`: job, rate for money viewers, trio, $), 'People' (`WorkerBreakdown`: name, kind, trio, overtime, $), 'Weekly' (`WeeklyTrendTable`: week, trio, overtime), 'Recent entries', 'Assigned' (if `assigned` present).
- [ ] **Step 3:** `ManageCard kind="project"`.
- New copy: 'Overtime', 'Budget used', 'Jobs', 'Add job', 'Rate', 'Assigned'.
- [ ] **Step 4:** `npm run check` → exit 0.

```bash
git add src/components/workerBreakdown.tsx src/components/weeklyTrendTable.tsx 'src/routes/_app/projects.$projectId.tsx' src/components/manageCard.tsx
git commit -m "feat: project detail page"
```

---

## Wave 4 · Cross-links, exports, docs

### Task 4.1: links and exports

**Files:**
- Modify: `src/components/structureTree.tsx` (client/project names link to detail pages), `src/routes/_app/reports.tsx` (ReconTable client names link; per-job rows link to project), `src/components/reconTable.tsx`, `src/routes/_app/today.tsx` (job option tooltip unchanged; interval list job cell links to project), `src/routes/_app/invoice.tsx` (client name links back)
- Modify: `src/lib/schemas/reports.ts`, `src/server/services/exports.ts`, both detail routes
- Test: `tests/integration/exports.service.test.ts` (append)

- [ ] **Step 1:** Links as listed; no copy changes (names become anchors).
- [ ] **Step 2:** `ExportCsvInput` gains `clientId?`, `projectId?` (optional filters honoured by the `'intervals'` and `'daily'` views through `loadPieces`' filter). Detail pages get an 'Export CSV' button that calls `exportCsvFn` with the entity filter and the selected period. Billing/admin only (existing gate).
- [ ] **Step 3:** tests: `'intervals'` view with `clientId: c2` has only `j3`/`j4` rows; with `projectId: p1` only `j1`/`j2` rows.
- [ ] **Step 4:** `npm run check` → exit 0; `npm run test:contract` green (`phase7-exports` asserts headers, unaffected).

```bash
git add src/components/structureTree.tsx src/components/reconTable.tsx src/routes/_app/reports.tsx src/routes/_app/today.tsx src/routes/_app/invoice.tsx src/lib/schemas/reports.ts src/server/services/exports.ts 'src/routes/_app/clients.$clientId.tsx' 'src/routes/_app/projects.$projectId.tsx' tests/integration/exports.service.test.ts
git commit -m "feat: entity links and scoped csv exports"
```

### Task 4.2: docs + final gate

- [ ] **Step 1:** `CLAUDE.md`: "Where things are" rows for `clients.ts`/`projects.ts` services, `search.ts`, `overtime.ts`, the four routes; rule 7 gains `CONTACT_NOT_FOUND` 404 (`id`); a one-line note under Money that "costs" on these pages means billable value and no cost-rate exists.
- [ ] **Step 2:** `npm run check && npm run test:contract && npm run build`; `git status` clean apart from `CLAUDE.md`.
- [ ] **Step 3:**

```bash
git add CLAUDE.md
git commit -m "chore: clients and projects pages wrap-up"
```

---

## Done Criteria

- `/clients` and `/projects` list, search, filter (status, activity, client, due), sort and page server-side; rows show effort, last activity and money-gated billable value; archived entities are reachable through the status filter.
- `/admin/clients` and `/admin/projects` no longer exist; admin sub-nav starts at Jobs; every old link is repointed.
- Client detail shows contacts (primary first), structured address, website, notes, editable by admin only and readable by all; figures for a selectable period and all time; projects (live and archived), people, weekly, recent entries; invoice link for money viewers.
- Project detail shows trio, overtime (per Locked Decision 6), money-gated billable value, per-job, per-worker, weekly, recent entries; budgets/due/assigned appear when the sibling plans have landed.
- Admin structure actions (rename, archive, unarchive, add child, rates) live on the detail pages; `StructureTree` still serves `/admin/jobs` and the reports admin panel.
- No new dependencies, no contract edits, no existing copy changed, `routeTree.gen.ts` committed with each route change, gates green.

## Sequencing

**Why this order.** Routing first because it is a one-commit move that makes the rest of the plan land on pages people can already reach, and because the generated route tree is the only piece here that fights `tsc`. The list machinery comes before either detail page because both pages need search, paging and the entity-scoped interval filter, and because list rows expose the cheap SQL aggregates the detail pages later confirm against `recon`. Clients before projects because contacts are a new table with a migration, and doing the schema work early keeps Wave 3 pure computation. Overtime math is a pure lib and lands before the service that calls it so the attribution rule is unit-tested in isolation. Cross-links and exports last because they only make sense once both destinations exist.

**What can slip.** Wave 1 and Wave 2 (through 2.2) are the minimum: pages out of Admin, searchable lists, and the contacts the user asked for. Task 2.3 and Wave 3 are the "in-depth data"; they can ship one section at a time. Wave 4 can slip; the pages work without inbound links, and the scoped CSV is a convenience. If overtime's definition (Locked Decision 6) is contested, drop `overtimeMin` from 3.2 and 3.3 and ship the rest; nothing else depends on it.
