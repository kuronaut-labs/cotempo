---
id: 7
title: "Billing vs honest view derivation rules"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: []
---

## Question

Given that raw intervals are the single truth and overlapped minutes are **duplicated** (each job bills the full overlapped time), what are the exact rules for deriving billing and honest views?

Define:
1. **Honest view** — what does "honest capture" look like in aggregate? If someone worked 3 jobs concurrently for 1 wall-hour, the honest view shows 3 hours of work. Is that the honest view, or is honest = 1 wall-hour with 3 concurrent jobs noted? What does "honest" mean here?
2. **Billing view** — each concurrent job bills its full interval. So 3 jobs x 1hr = 3 billable hours. How is this presented in reports? Is there a "billable total" that can exceed wall-clock time?
3. **Edge cases** — what if the same worker has 5 overlapping jobs? Is there a cap, or is 5x duplication acceptable? What if a job overlaps with itself (stopped and restarted)?
4. **Report shapes** — per-client billing, per-worker utilization (wall-clock vs concurrent), per-job cost. What aggregations does each view need?
5. **Reconciliation** — is there a need to reconcile billing total vs wall-clock total? Who sees both numbers and when?

This depends on the data model (ticket #4) being resolved first.

## Context (post-#4 resolution)

Data model #4 is now closed. Key facts for this ticket:
- Intervals are the single source of truth (implicit overlaps, computed on demand).
- Billing view = `SUM(end - start)` per job/worker/period; overlaps counted fully (duplicate attribution).
- Honest view = `duration_of_union(all intervals for worker in period)` — wall-clock reality.
- `billable_rate` on jobs determines billability; `deleted_at` soft-delete filters out removed intervals.
- Derivation is computed on demand (no pre-computed aggregates).

## Resolution

All grilling answers accepted recommendations as proposed. Rules locked:

### Billing view rules

- **Billable hours** = `SUM(end − start)` per interval WHERE `job.billable_rate IS NOT NULL` AND `deleted_at IS NULL`. Overlaps count fully — duplicate attribution stands, and the billable total **can and does exceed wall-clock by design**.
- **Invoice amount** = billable hours × `billable_rate`, aggregated per client/project/job per period.
- **Exact minutes everywhere.** No rounding in storage or derived views. Rounding, if ever wanted, is an export-time concern (v1: no export rounding).
- **Period-crossing intervals**: the raw interval row stays whole; derived views split it at period boundaries and attribute each slice to its period (proportional split). Period boundaries are computed in a single **org-level timezone** setting; storage stays UTC ms-epoch.

### Honest view rules (the trio — always shown together)

- **Wall-clock** = union of ALL the worker's intervals in the period (reality; includes non-billable work).
- **Effort** = sum of ALL interval durations (total work performed).
- **Overlap premium** = effort − wall-clock (the duplication).
- The premium is always rendered next to billing totals. This is the disclosure posture CA Formal Opinion 1996-147 requires: concurrent billing is defensible when visible and consented — the premium IS the disclosure.
- **Billable hours** = subset of effort on billable jobs; **non-billable effort** = effort − billable hours.

### Edge cases

- **Same-job overlap** (two intervals for the same job overlapping) = **data error, blocked at entry** — app-layer validation in server functions (D1 cannot enforce this). Applies to create AND edit paths; retroactive edits that would create same-job overlap are rejected. Cross-job overlap remains free — that is the feature.
- **No concurrency cap.** Any number of jobs may overlap. The overlap premium is always visible so unreasonableness is detectable. An optional soft warning threshold (e.g., "you're at 4 concurrent jobs") is a UI concern deferred to #11.

### Report shapes (v1 — all four)

1. **Per-client billing**: billable hours × rate per client per period (money — billing/admin only).
2. **Per-worker utilization**: wall-clock vs effort per period (time-only; operators see own + supervisees).
3. **Per-job totals**: hours + dollars per job (billing/admin see dollars; operators hours only).
4. **Reconciliation**: billable hours/dollars vs wall-clock + overlap premium per period (billing/admin).

Visibility follows #5: operators get time-only versions of any report — no rates, no dollar totals, anywhere.

### Carried implications

- Approval workflow fog is now specifiable → graduated to ticket #12.
- Overlap premium computation reuses the union math (same TypeScript code path as the honest view).

## Status

Closed. Resolution recorded above; map Decisions-so-far updated.
