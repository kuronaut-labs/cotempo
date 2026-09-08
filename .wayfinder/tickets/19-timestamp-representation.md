---
id: 19
title: "Timestamp representation: one encoding for intervals and audit columns"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: []
---

## Question

#4 locks "timestamps as integer ms-epoch (Drizzle/D1 convention)" and #7 says "storage stays UTC ms-epoch". The v1 plan stores interval `started_at`/`ended_at` as ISO 8601 text and every `created_at`/`updated_at`/`deleted_at` as unixepoch seconds via Drizzle's `timestamp` mode. The #12 red flags compare interval start against interval creation time, so the two encodings meet in the same query.

Decide:

1. One encoding for all timestamps: integer ms-epoch (#4), integer seconds, or ISO text?
2. If integer, which Drizzle column mode (`timestamp` = seconds, `timestamp_ms`, or plain integer with app-side Date handling) and what SQLite default expression.
3. Index strategy for intervals given the encoding: `(worker_id, started_at)` and `(job_id, started_at)` at minimum? Does the encoding affect range-query performance on D1?

Output: a column convention the schema task applies uniformly, and the two index definitions. Record as a refinement on #4. Unblocks #22 (minute alignment).

## Resolution

Closed by wayfinder after grilling with user (2026-09-07). All three recommendations accepted. **#4 stands: integer ms-epoch everywhere. The plan's ISO text intervals and unixepoch-seconds audit columns are rejected.**

### Column convention

Every timestamp column in every table (`started_at`, `ended_at`, `created_at`, `updated_at`, `deleted_at`/`archived_at`, approval `*_at`, BetterAuth `expires_at`/`created_at`/`updated_at`):

```ts
integer('<name>', { mode: 'timestamp_ms' })   // Date in TS, ms-epoch integer in SQLite
```

- **App-supplied values.** No DB `DEFAULT` expression. Server functions set `created_at`/`updated_at` from `Date.now()`; seed SQL writes explicit ms integers. One writer convention, no `unixepoch('subsec')` casting.
- `dayMath` keeps working on ms numbers; callers pass `date.getTime()`.
- BetterAuth's drizzle adapter accepts `timestamp_ms` columns for its own tables; confirm at build against research #15's adapter version.

### Indexes (migration 0000)

```sql
CREATE INDEX intervals_worker_start ON intervals (worker_id, started_at) WHERE deleted_at IS NULL;
CREATE INDEX intervals_job_start    ON intervals (job_id,    started_at) WHERE deleted_at IS NULL;
CREATE INDEX intervals_start        ON intervals (started_at)            WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX approvals_worker_week ON approvals (worker_id, week_start);   -- #12
```

Partial indexes exclude soft-deleted rows, which every read filters out anyway.

### Implications

- **#4:** confirmed; mode and index set made precise.
- **#12:** red-flag comparisons (interval start vs `created_at`, entry time vs week end) are now same-unit integer arithmetic.
- **#24 (schema reconciliation):** apply this mode to every table in the delta.
- **#22 (minute alignment):** unblocked; the encoding is ms integers, so alignment means `value % 60_000 === 0`.
- **Plan:** Task 1.2 schema rewritten; Zod inputs may still accept ISO strings at the API edge (`z.iso.datetime()`) and convert to `Date` in the handler — the storage encoding does not dictate the wire format.
- No new tickets surfaced.
