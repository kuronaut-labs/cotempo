---
id: 12
title: "Approval workflow: locking, granularity, and flow"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: []
---

## Question

Billing/admin can approve/lock timesheets (#5). What does approval actually mean operationally?

1. **Granularity** — what gets approved: per worker per week? per client per month? per job per period? Per-operator-batch (everything I supervise)?
2. **Locking semantics** — once approved, are intervals frozen? Soft-lock (admin can unlock) vs hard-lock? Does editing a locked period require re-approval?
3. **Flow** — submit → approve → reject-and-return? Do operators submit, or is approval initiated by billing browsing completed weeks? Is there a "submitted/pending" state at all, or does billing just lock periods proactively?
4. **Retroactive edits after approval** — what happens when an interval inside a locked/approved period is edited or deleted (soft-delete)?
5. **What the approver sees** — reconciliation data (per #7: billable vs wall-clock + overlap premium) at approval time?

## Context (post-#7 resolution)

- #5 resolved WHO: billing + admin approve; operators cannot self-approve.
- #7 resolved WHAT THEY SEE: reconciliation view (billable hours/dollars vs wall-clock + overlap premium) exists per period; all four report shapes available.
- #4: intervals are soft-delete only; no approval_status column yet — this ticket decides whether it lives on intervals, a separate approvals table, or period-level locks.
- Data model supports on-demand derivation; approval state is the one piece of derived-billing data that plausibly needs persistence (locking).

Out of scope: client-facing approval (no client portal — roadmap).

## Resolution

Closed by wayfinder after grilling with user. All five sub-questions confirmed against the recommended options.

### Approval model (v1)

| Aspect | Decision |
|---|---|
| Granularity | **Per worker per week.** Operators submit one week per supervisee (and themselves). Billing/admin approves per worker-week. |
| Lock semantics | **Soft lock, re-approval required.** Approved weeks are read-only for operators. Admin can unlock for corrections, which drops the week back into the operator's queue. Audit trail on every unlock/approval cycle. |
| Flow | **Operator submits, billing approves.** Operator-initiated sign-off. Rejection returns the week with a comment. |
| Retroactive edits | **Operators blocked; admin unlocks + re-approval.** Operators cannot edit intervals in an approved week. Admin unlocks the week; operator edits; week re-enters the approval queue. The unlock itself is audited. |
| Approver view | **Trio + interval list + red flags.** Reconciliation trio (billable / honest / premium) as headline, per-interval list with audit metadata (who entered, when, last edit), inline red flags (large gaps, intervals entered after week end, multiple edits). |

### Schema (impacts #4)

A new `approvals` table — week-level, not interval-level. Per-interval status would be redundant (all intervals in a week share state) or complicated (mixed states). Approval is a property of the (worker, week) pair.

```
approvals
  id (pk)
  worker_id (fk → workers, not null)
  week_start_date (date, ISO Monday, not null)
  status (enum: draft, submitted, approved, rejected)
  submitted_at, submitted_by
  approved_at, approved_by
  rejected_at, rejected_by
  rejected_reason (text)
  approved_comment (text, nullable)
  constraint: unique(worker_id, week_start_date)
```

### State transitions

- `draft → submitted` (operator)
- `submitted → approved` (billing/admin)
- `submitted → rejected` (billing/admin; → operator's queue)
- `rejected → draft` (operator edits) — or implicitly resets on next submit
- `approved → draft` (admin unlock for correction; → operator's queue)

Every transition recorded with actor + timestamp + reason in a separate `approval_events` table for audit trail.

### Authorization (refines #5)

- **Operators:** submit and view own/supervisee weeks
- **Billing + admin:** approve, reject, unlock, view all weeks
- **Admin only:** unlock (audit trail)
- Operators can never self-approve (no path in the API)

### Red flags (for approver view)

Computed on demand from interval metadata + entries table:

- **Large gap:** any weekday with >16 hours of unaccounted time, or any weekday missing entirely from the week
- **Post-week-end entry:** interval inserted more than 7 days after week_end_date
- **Multiple edits:** interval edited more than 2 times
- **Retroactive start:** interval start_date precedes the entry creation date (was logged after-the-fact)

Thresholds configurable via app config (not data); defaults above.

### Implications

- **#4 (data model):** Add `approvals` + `approval_events` tables; Drizzle schema + migration. No changes to existing tables.
- **#5 (roles):** Refines — operators gain `submit_week` action; admin gains `unlock_week` action. No new roles.
- **#10 (API):** New server fns in `src/server/fns/approvals.ts`:
  - `submitWeek({workerId, weekStart})` — operator
  - `approveWeek({workerId, weekStart, comment?})` — billing/admin
  - `rejectWeek({workerId, weekStart, reason})` — billing/admin
  - `unlockWeek({workerId, weekStart, reason})` — admin
  - `listPendingWeeks()` — billing/admin queue
  - `getWeekForApproval({workerId, weekStart})` — billing/admin (trio + intervals + red flags)
- **#11 (reporting):** Billing tab gains a "Pending approvals" queue alongside period reports. Operator tab gains "Submit week" affordance when the week ends. Admin can view audit trail.

### Out of scope (not in v1)

- Auto-lock at period end
- Multi-level approval (manager then billing)
- Approval delegation
- Email/Slack notifications on submit/approve/reject
- Approval thresholds (e.g., flag weeks where billable > $X)

## Status

Closed. Recorded on map as Decision #12.
