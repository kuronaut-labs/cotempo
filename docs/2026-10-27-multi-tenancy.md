# Multi-tenancy plan

Status: draft for review, 2026-10-27. Nothing here is built yet.

Goal: one deployment serves many companies. Each company sees only its own workers, clients, time and money, and has its own settings and time zone.

## Prerequisite: revise the recorded decisions

The plan conflicts with decisions in `.wayfinder/`, which only you can change:

- **#3, one org settings row (id `'org'`).** Becomes one settings row per organisation.
- **#23, time zone from the `ORG_TIMEZONE` variable.** Becomes a time zone stored on the organisation. It's fixed once the organisation has time entries, because approval week keys are derived in that zone.
- **#8 and #16, invites through BetterAuth's admin plugin.** The admin plugin acts on every user in the database, so it has to go. Invites create the user directly, as `seedAuthUsers` in `src/server/fixtures/demo.ts` already does.

Nothing below starts until these are updated.

## Key design choices

### Organisation id on root tables only

`org_id` goes on the tables at the top of each ownership chain. Every other row reaches its organisation through a parent.

| Root table (gets `org_id`) | Rows that reach it through a parent |
|---|---|
| `workers` | `human_workers`, `agent_workers`, `intervals`, `interval_events`, `approvals`, `approval_events`, `assignments`, `leave_requests`, `leave_events` |
| `clients` | `client_contacts`, `projects`, `jobs` |
| `positions` | (none) |
| `leave_types` | (none) |
| `org_settings` | keyed by organisation id, replacing `'org'` |

Why not put `org_id` on every table:
- **The contract tests forbid it.** Several of them insert `intervals` rows directly without an organisation column, and they can't be edited. A NOT NULL `org_id` on `intervals` would break them, and a default value would silently put any forgotten row into a fixed organisation.
- **The data model is already a tree** (#24). Most queries already join intervals to jobs, projects and clients, or to workers, so the filter costs one extra condition rather than one extra join.

The price is a set of write-time rules that stop a row from linking two organisations. Phase 3 lists them.

### One organisation per user, for now

A user belongs to exactly one organisation, through `human_workers` to `workers.org_id`, so emails stay globally unique. Someone who works for two companies needs two accounts. Allowing one account across several organisations later means:
- a membership table,
- dropping the unique constraint on `human_workers.user_id`,
- an "active organisation" on the session.

The rest of this design doesn't block that.

### The organisation comes from the session, not the URL

The session context finds the organisation from the signed-in user's worker. There are no subdomains, and one login page serves every organisation. Organisation subdomains can be added later as cosmetic routing, without changing scoping.

### Another organisation's ids look like ids that don't exist

Reading or writing a row from another organisation returns the same error as a missing row: `NOT_FOUND`, `JOB_NOT_FOUND` and so on. A `FORBIDDEN` would confirm that the id exists somewhere.

## Phases

Each phase ends with the gate green (`npm run check` plus `npm run test:contract`).

### Phase 1: schema and fixtures (1–2 days)

- **New table.** `organizations`: `id`, `name`, `timezone` (IANA, validated like `ORG_TIMEZONE` is today), `created_at`, `archived_at`.
- **New columns.** `org_id` NOT NULL with a foreign key to `organizations` on `workers`, `clients`, `positions` and `leave_types`, each with an index.
- **Settings.** `org_settings.id` becomes the organisation id, with a foreign key.
- **Uniqueness per organisation.** `leave_types.key` becomes unique on `(org_id, key)`. Check any other global unique index the same way.
- **Migration.** Regenerate `0000_*` with `npm run db:generate`, which CLAUDE.md allows before first deploy.
- **Fixtures.** `src/server/fixtures/demo.ts` gets the demo organisation (Perth) for every existing row, plus a second organisation, "Org B" (Sydney). Org B mirrors the demo data with its own ids: workers, a client with jobs, intervals, an approved week, a leave type, a position and an assignment.
- **Test helpers.** `tests/integration/helpers.ts`: `asUser()` carries the demo organisation, and a new `asOrgBUser(role)` returns Org B users. The contract tests only use `asUser`, `deps`, `db` and `resetDb`, so they keep passing unchanged.

### Phase 2: organisation in the request (1 day)

- **Session context.** `SessionContext` in `src/server/context.ts` gains `orgId` and `orgTz`, and `buildSessionContext` loads them from the user's worker and organisation. An archived organisation is refused like an archived worker.
- **Supervisee lookup.** `superviseeWorkerIds` already comes from a supervisor link inside one organisation, so it needs no change.
- **Per-request time zone.** `runtimeDeps()` becomes `runtimeDeps(ctx)` and takes `tz` from `ctx.orgTz`. All 95 fn wrappers change from `runtimeDeps()` to `runtimeDeps(ctxOf(context))`, a mechanical edit.
- **Today's date.** `getTodayFn` has no auth middleware and reads the deployment time zone. It needs `authMw` so it can use the organisation's zone. The `/login` and `/set-password` routes don't call it.
- **Environment.** `ORG_TIMEZONE` is removed from `src/server/env.ts` and `wrangler.jsonc`, or kept only as the default for new organisations.

### Phase 3: scope every service (5–7 days, the bulk of the work)

**Write the leak suite first, and watch it fail.** A new `tests/integration/tenancy.test.ts`:
- **Reads.** For every exported service function (81 today), call it as each demo role and check that no Org B id appears anywhere in the result. The check is a deep search like the existing `deepHasKey` in `tests/contract/_util.ts`.
- **Writes.** For every function that takes an id, pass an Org B id and expect the not-found error.
- **No gaps.** A coverage test imports every service module and fails if an exported function has no entry in the leak table, so a new service can't skip it.

**Then fix each service until it passes:**

| Service file | Change |
|---|---|
| `intervals.ts` | `liveJob` adds `clients.org_id = ctx.orgId` to its existing join. Any worker id in input must belong to `ctx.orgId`. `listDay`'s billing worker list, `listIntervals` and `getRecentJobs` filter through `workers.org_id`. |
| `workers.ts`, `invites.ts` | Lists filter `workers.org_id`. New agents and invited people get `ctx.orgId`. Supervisor and position must be in the same organisation. |
| `structure.ts`, `clients.ts`, `projects.ts` | Clients filter by `org_id`; projects and jobs join to it. Parent existence checks include the organisation. |
| `reports.ts`, `exports.ts`, `allocations.ts` | `loadPieces` and `loadIntervalRowsForCsv` always add `projects.client_id IN (this org's clients)` through the existing join. Worker counts in `adminKpis` and `weeklyTrends` filter by organisation. |
| `approvals.ts` | Queue, week view, team view and bulk approve join to `workers.org_id`. Target worker must be in the organisation. |
| `leave.ts` | Leave types filter by `org_id`. Requests, queue, report and export join to `workers.org_id`. The leave type and the worker must be in the same organisation. |
| `positions.ts`, `settings.ts`, `assignments.ts` | Filter by `org_id`. Settings read and write the row whose id is `ctx.orgId`. Assignment targets and workers must be in the organisation. |
| `src/server/inviteState.ts`, `src/server/sessionContext.ts` | Already reached through the user's own worker; no change beyond phase 2. |

**Write-time rules** stop a row from linking two organisations. Each gets a test:
- an interval's worker and job;
- an assignment's worker and target;
- a worker and their supervisor;
- a human worker and their position;
- a leave request's worker and leave type.

**Guards.** `assertCanEditWorker` and `assertCanViewWorker` stay synchronous, as the guard contract tests require. A new async `assertWorkerInOrg(db, ctx, workerId)` in `src/server/guards/` runs before them in every service that takes a worker id.

### Phase 4: auth without the admin plugin (1–2 days)

- **Remove the plugin.** Take `admin()` out of `src/server/auth.ts`, which closes `/api/auth/admin/*` entirely.
- **Invites.** `inviteUser` writes the user, the credential account (random password) and the worker rows in one batch, then sends the reset link as today.
- **Block archived users.** A BetterAuth `databaseHooks.session.create.before` hook refuses users whose worker or organisation is archived. `archiveWorker` keeps deleting the person's sessions, and the `role` and `banned` updates are dropped.
- **Schema cleanup.** The admin-plugin columns (`user.role`, `banned`, `ban_reason`, `ban_expires`, `session.impersonated_by`) can go in the regenerated `0000_*`.
- **Scripts.** `scripts/seed-admin-remote.ts` drops its admin plugin import.

### Phase 5: creating organisations (1 day)

- **Script first.** `scripts/create-org.ts` creates an organisation, its settings row and its first admin, following `seed-admin-remote.ts`: hash locally, emit SQL, then `wrangler d1 execute --remote`.
- **Self-serve sign-up later.** It needs a public route, abuse protection and probably billing. It's a separate decision.

### Phase 6: UI and polish (1–2 days)

- Show the organisation name in the nav.
- The admin Settings page shows the time zone, read-only once the organisation has time entries.
- Check every route loader works without the deployment time zone.

Total: about 2–3 weeks.

## Scale ceiling

One D1 database is capped at 10 GB, and each database handles writes one at a time. A rough sizing: an interval row plus its indexes is around 200 bytes. 100 companies × 20 workers × 10 entries a day × 250 days is 5 million rows, about 1 GB a year. That's comfortable for a few hundred small companies, and not for thousands of busy ones.

The root-table design keeps every company's data reachable from its own rows, which makes the next step possible: moving large companies, or groups of companies, into their own D1 databases. Cloudflare's guidance is to use many small D1 databases. Not needed now; watch database size and write latency once there are real customers.

## Risks

- **A missed filter leaks data between companies.** Mitigation: the phase 3 leak suite, its coverage check, and a rule in CLAUDE.md that every new service gets a leak-table entry.
- **Time zone changes.** Changing an organisation's zone after entries exist would move week keys, so it's refused.
- **Contract tests.** They assume a single organisation, but only through the helpers and fixtures, which can be edited. If one turns out to depend on global behaviour, I'll stop and report it, as CLAUDE.md requires.
- **Effort range.** The 81 service functions are the uncertain part. Most are a one-line filter; the reports and exports paths take longer.
