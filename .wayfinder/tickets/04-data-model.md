---
id: 4
title: "Data model for concurrent workers, jobs, intervals, and overlaps"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: [2]
---

## Question

What is the core data model for a concurrent timesheeting platform where overlapped minutes are duplicated (not split)?

Define the entities and relationships for:
1. **Workers** — humans and AI agents as first-class workers. What attributes does each type carry? (An agent may have model, run-id, client assignment; a human may have name, email, role.)
2. **Jobs/tasks** — what constitutes a unit of work? How are jobs linked to clients/projects? Can a job be assigned to multiple workers?
3. **Clients/projects** — how are billable targets represented? Is a client the same as a project, or are they nested?
4. **Time intervals** — how is a raw interval stored? Start, end, worker, job, and what else? How are overlaps represented — implicitly (just store intervals and compute overlaps) or explicitly (an overlap entity)?
5. **The "one truth" principle** — raw intervals are the source of truth. How do billing and honest views derive from them? What's the derivation shape (without locking the rules yet — that's ticket #7)?
6. **Operators** — how is the operator- supervises-multiple-workers relationship modeled?

Consult the prior art research (ticket #2) for existing interval and overlap models.

This is the foundational ticket — reporting, agent attributes, and API design all depend on it.

## Resolution

**Closed by wayfinder after grilling with user. Decisions confirmed m0066-m0067.**

### Entities and schema

**workers** (base table — all time-loggers, humans and agents)
- `id` text PK
- `type` `'human' | 'agent'` — discriminator
- `name` text
- `supervisor_id` text FK → workers.id, nullable — operator who supervises this worker
- `created_at` integer (ms epoch)
- `archived_at` integer, nullable

**human_workers** (extension — 1:1 with workers where type='human')
- `worker_id` text PK FK → workers.id
- `email` text, unique
- `role` `'operator' | 'admin' | 'billing'` — subject to #5 refinement
- `user_id` text — link to BetterAuth user (wired in #8)

**agent_workers** (extension — 1:1 with workers where type='agent')
- `worker_id` text PK FK → workers.id
- `model` text, nullable (e.g. "claude-3.5-sonnet")
- `framework` text, nullable (e.g. "langgraph", "crewai", "manual")
- `status` `'active' | 'paused' | 'archived'`
- Operational attributes (run_id, session tracking, token counts) deferred to "agent worker attribute schema" fog item.

**clients**
- `id` text PK
- `name` text
- `created_at` integer
- `archived_at` integer, nullable

**projects**
- `id` text PK
- `client_id` text FK → clients.id
- `name` text
- `created_at` integer
- `archived_at` integer, nullable

**jobs**
- `id` text PK
- `project_id` text FK → projects.id
- `name` text
- `billable_rate` integer, nullable — null/0 = non-billable; billability derived from here
- `status` `'open' | 'closed'`
- `created_at` integer
- `archived_at` integer, nullable

**intervals** (THE single source of truth)
- `id` text PK
- `worker_id` text FK → workers.id
- `job_id` text FK → jobs.id
- `start` integer (ms epoch)
- `end` integer, nullable — null = running timer
- `entered_by` text FK → workers.id — the human who logged it (operator; = worker_id for self-entry)
- `notes` text, nullable
- `created_at` integer
- `updated_at` integer
- `deleted_at` integer, nullable — soft delete; no hard deletes (immutable-ledger pattern)

### Derived views (computed on demand, never stored)

**Billing view** (duplicate attribution):
- `billable_hours = SUM(end - start)` for intervals WHERE `job.billable_rate IS NOT NULL` AND `deleted_at IS NULL`, grouped by job/worker/period.
- Overlaps counted fully — 3 jobs × 1hr overlapping = 3 billable hours.

**Honest view** (wall-clock reality):
- `honest_hours = duration_of_union(all intervals for worker in period)`.
- Merge overlapping intervals per worker → actual wall-clock time worked.
- Gap between billing and honest = overlap premium.

### Key decisions made

| Decision | Choice | Rationale |
|---|---|---|
| Worker type discrimination | Base table + extension tables | Clean schema; human/agent fields separated; accepted join cost |
| Client/Project/Job hierarchy | Three levels (Client > Project > Job) | User wants structure for multi-project clients |
| Overlap representation | Implicit (compute at query time) | Single source of truth; no sync risk; D1 lacks PG EXCLUDE constraints anyway |
| Operator supervision | Single `supervisor_id` FK on workers | Sufficient for single-org; one operator per worker |
| Billability | Derived from job's `billable_rate` | No per-interval flag; less duplication |
| Billing/honest derivation | On demand at query time | Always correct; no stale aggregates; optimize later if needed |

### Design notes

- Timestamps as integer ms-epoch (Drizzle/D1 convention).
- `entered_by` always references a human worker (app-level validation; SQLite can't enforce type discrimination at FK level).
- Soft deletes on intervals — no hard deletes, matching immutable-ledger pattern from billing research.
- Approval workflow (fog, depends #5/#7) will likely add `approval_status` or a separate approvals table — not modeled yet.
- Agent operational attributes deferred to "agent worker attribute schema" fog item.
- Overlap computation in app code (TypeScript): given intervals for a worker in a period, find pairwise intersections, attribute each overlapped segment to each job.
