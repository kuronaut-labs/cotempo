---
id: 18
title: "Billability semantics and billable_rate storage type"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: []
---

## Question

#4 defines `jobs.billable_rate` as a nullable integer where null or 0 means non-billable, and #7 derives billable hours from `billable_rate IS NOT NULL`. The v1 plan declares it `REAL NOT NULL DEFAULT 0` in dollars per hour and computes money as `minutes × rate / 60`, rounding to cents at the final multiplication.

Decide:

1. **Non-billable marker.** Nullable rate (null = non-billable, per #4/#7) or `NOT NULL` with 0 meaning non-billable (per the plan)? Is a zero-rate billable job a real case (pro bono time that still appears on the invoice)?
2. **Storage type.** Integer cents per hour (exact, per #4's integer) or REAL dollars (per the plan)? Consider float artefacts when multiplying by minutes and summing across a period.
3. **Rounding point.** Confirm #7's "exact minutes, no rounding" applies to hours, and fix where money rounds: per interval, per job, per client, or once per invoice total.
4. **Rate changes over time.** A job's rate edited mid-period re-prices past intervals under the current model. Accept for v1, or snapshot rate onto intervals at entry?

Output: the column definition and the money formula the plan implements. Record as a refinement on #4 and #7.

## Resolution

Closed by wayfinder after grilling with user (2026-09-07). All four recommendations accepted. **#4/#7 stand on billability; the plan's `REAL NOT NULL DEFAULT 0` is rejected. One addition: rate snapshot on intervals.**

### Columns

```
jobs.billable_rate_cents   integer, NULLABLE   -- null = non-billable; 0 = billable at $0
intervals.rate_cents       integer, NULLABLE   -- snapshot of job.billable_rate_cents at create/edit
```

- **Billable** ⇔ `intervals.rate_cents IS NOT NULL`. Non-billable jobs never produce invoice lines. A 0 rate is billable at $0 (pro bono line item).
- **Snapshot rule:** on interval create, and on any edit that changes `job_id`, copy the job's current `billable_rate_cents` into `intervals.rate_cents`. Edits that only move times keep the existing snapshot. Editing a job's rate affects future intervals only. Approved weeks and issued invoices never silently re-price.
- The snapshot is **input data** (the contractual price at time of work), not a derived value, so the "derived data is never stored" rule (#4) is intact.
- Optional admin action "re-price unapproved intervals for this job" is **fog for v2**, not v1.

### Money formula

- Hours stay exact integer minutes (#7). No rounding of time anywhere.
- **Any displayed money figure** = `round_half_up(Σ minutes_in_grouping × rate_cents / 60)` in cents, computed once at the grouping being displayed. Because rates can differ per interval (snapshots), the sum is over `minutes × rate_cents` per interval, then divided by 60 and rounded once.
- **Invoice** (#11): each line = one job for the period, rounded per line; invoice total = sum of rounded lines. The invoice is authoritative.
- **CSV** (#11): per-row amount rounded per row; informational, may differ from the invoice total by sub-cent accumulation.
- UI converts cents → dollars only at render.

### Implications

- **#4:** `jobs.billable_rate` → `billable_rate_cents` nullable integer (name and type refined); `intervals` gains `rate_cents`.
- **#7:** billable predicate moves from `job.billable_rate IS NOT NULL` to `interval.rate_cents IS NOT NULL`; rounding rule made precise.
- **#24 (schema reconciliation):** must carry `rate_cents` on intervals and the renamed job column.
- **#10:** `UpdateJobInput.billableRateCents` nullable integer ≥ 0; `CreateIntervalInput` does not accept a rate (server copies it).
- **Plan:** Task 1.2 schema, `dayMath` gains a `moneyCents(rows: {minutes, rateCents}[])` helper, seed uses cents.
- Map fog item "Rate history" is cleared by the snapshot decision.
