---
id: 24
title: "Reconcile plan schema with the #4 data model"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: []
---

## Question

The v1 plan's Drizzle schema (Task 1.2) departs from #4 in several places without recording a revision:

| #4 says | Plan does |
|---|---|
| `workers.type` | `workers.kind` |
| `archived_at` on workers/clients/projects/jobs | `deleted_at` everywhere |
| `human_workers.email` | dropped; email comes from the BetterAuth `user` row |
| `intervals.end` nullable (running timer, keeps v2 live timers additive per #6/#13) | `ended_at NOT NULL` |
| `jobs.status` open/closed | omitted |
| `intervals.entered_by` | `created_by` |
| `workers.name` for all | humans NULL, display name via `user.name` join |

Decide, for each row: accept the plan's version as a revision of #4, or restore #4. Specifically:

1. Is `archived_at` (structure) distinct from `deleted_at` (intervals)? #4 used both deliberately; the plan collapses them.
2. Does dropping `human_workers.email` break anything in #5 or #8? (Roles and invitations key on the auth user.)
3. Must `ended_at` stay nullable to honour the v2 promise, even though v1 never writes null?
4. Is `jobs.status` needed in v1 for the entry form's job picker (hide closed jobs) and the #11 structure tree?

Output: the final v1 table definitions as a delta against #4, applied to plan Task 1.2. Record as a refinement on #4. Coordinate with #18 (rate column) and #19 (timestamps), which own their columns.

**Update 2026-09-07:** #18 closed. Carry into the delta: `jobs.billable_rate_cents` nullable integer (replaces `billable_rate`), and new `intervals.rate_cents` nullable integer snapshot.

**Update 2026-09-07:** #19 closed. Every timestamp column is `integer(..., { mode: 'timestamp_ms' })`, app-supplied, no DB default. Intervals carry three partial indexes and approvals a unique (worker_id, week_start); include them in the Task 1.2 delta.

**Update 2026-09-07:** #23 closed. `approvals.week_start` is `text` (`YYYY-MM-DD`, local Monday in the org zone), the one non-ms date column; note it as a deliberate exception to #19.

## Resolution

Closed by wayfinder after grilling with user (2026-09-07). All recommendations accepted. Final v1 schema as a delta against #4, folding in #18, #19, #22, #23.

### Delta against #4

| Column | Decision |
|---|---|
| `workers.type` | renamed `kind` |
| `workers.name` | nullable; agents only. Humans display `user.name` |
| `workers.archived_at`, `clients.archived_at`, `projects.archived_at`, `jobs.archived_at` | **kept** (#4). Hidden from pickers, present in reports |
| `intervals.deleted_at` | kept (#4). Removed from every derived view. Distinct from archive |
| `human_workers.email` | **dropped**; join `user.email` |
| `human_workers.role` | `roles` JSON text (#5/#8) |
| `intervals.end` nullable | **`ended_at NOT NULL`** in v1. v2 live timers add a migration |
| `intervals.entered_by` | renamed `created_by` |
| `intervals.edit_count` | added (#12 red flag) |
| `intervals.rate_cents` | added, nullable snapshot (#18) |
| `jobs.billable_rate` | `billable_rate_cents` nullable integer (#18) |
| `jobs.status` | **dropped**; `archived_at` covers closed |
| all timestamps | `integer(..., { mode: 'timestamp_ms' })`, app-supplied (#19) |
| `approvals.week_start` | `text` `YYYY-MM-DD`, local Monday in org zone (#23). Sole non-ms date |
| indexes | three partial on intervals, unique `(worker_id, week_start)` on approvals (#19) |

`approvals` and `approval_events` per #12, status enum `draft | submitted | approved | rejected`. BetterAuth `user`/`session`/`account`/`verification` plus admin-plugin columns, same timestamp mode.

### Implications

- #4 gist refined to point here for the final shape.
- #6/#13's "v2 timers need no schema change" is now "v2 timers need one nullable-column migration". Recorded on #13's gist.
- Plan Task 1.2 rewritten from this table. One migration wave (0000) for everything including approvals; the plan's second wave is unnecessary.
- Unblocks #26.
