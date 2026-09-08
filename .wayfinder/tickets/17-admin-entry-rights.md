---
id: 17
title: "Admin entry/edit rights on non-supervisees' time"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: []
---

## Question

The roles matrix in #5 gives admin a tick for "Enter time for non-supervisees" and "Edit/delete any others' intervals". The v1 plan's `assertCanEditWorker` guard (Task 3.2) says the opposite: "Billing/admin do NOT get entry rights on others" and only permits self + supervisees, citing #5 as its source.

Decide:

1. Which is right for v1: admin is a superuser for time entry (per #5), or entry scope is strictly self + supervisees for everyone, with admin gaining override only through the #12 unlock path?
2. If admin may enter time for anyone, does `entered_by` (#4, `created_by` in the plan) plus the #12 red flags give enough audit for that, or does an admin-entered interval need its own flag?
3. Does billing ever get entry rights beyond its operator baseline? (#5 says no; confirm.)

Output: a corrected row or two in the #5 matrix, and the exact rule the guard helper implements. Record any change as a refinement on #5's gist.

## Resolution

Closed by wayfinder after grilling with user (2026-09-07). All three recommendations accepted. **#5 stands; the plan's guard is wrong.**

### Rule

- **Entry/edit scope** = self ∪ supervisees, **plus everyone if the actor holds `admin`**. Billing gets nothing beyond its operator baseline.
- The guard helper (`assertCanEditWorker` in the plan) becomes: `if roles includes 'admin' → allow; else target ∈ {self} ∪ supervisees → allow; else 403 FORBIDDEN_TARGET`.
- The #12 approved-week lock still applies to admin: editing an interval inside an approved week requires an unlock first, for everyone. Superuser entry rights do not bypass approval state.

### #5 matrix (unchanged, confirmed)

| Action | Operator | + Billing | + Admin |
|---|---|---|---|
| Enter time for non-supervisees | ✗ | ✗ | ✓ |
| Edit/delete any others' intervals | ✗ | ✗ | ✓ |

### Audit

- No schema change. `created_by` (#4's `entered_by`) already records the actor.
- **New #12 red flag — "entered by non-supervisor":** computed at approval time when `interval.created_by` is neither the worker themself nor the worker's current `supervisor_id`. Surfaces admin-entered intervals in the approver view alongside the existing four flags. Thresholds n/a; it is a boolean flag.

### Implications

- **#5:** confirmed as written; the plan's Task 3.2 guard comment and logic are corrected, not the matrix.
- **#12:** red-flag list grows from four to five.
- **Plan Task 3.2:** rewrite `assertCanEditWorker`; `assertCanViewWorker` was already correct (billing/admin view all).
- No new tickets surfaced.
