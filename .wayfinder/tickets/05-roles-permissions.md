---
id: 5
title: "Roles and permissions matrix"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: []
---

## Question

What are the exact permissions for each role in the platform?

Three roles identified: **operator**, **admin**, **billing/approver**.

Define for each role:
1. **What they can create/edit/delete** — time entries, jobs, clients, workers, other users
2. **What they can view** — their own entries, all entries, reports, billing data
3. **What they can approve/reject** — can billing/approver lock a timesheet period? Can operators self-approve?
4. **Cross-role interactions** — can someone hold multiple roles? Can an admin do everything an operator can? Can an operator see billing data?
5. **Edge cases** — can an operator edit another operator's entries? Can billing/approver create entries, or only review them?

Output a permissions matrix (role x action) that engineering can implement directly.

## Resolution

**Closed by wayfinder after grilling with user. Decisions confirmed m0082-m0083.**

### Role model

- Every human's `roles` array contains `'operator'` as **baseline**; `'billing'` and `'admin'` are **additive**.
- Founder-type user = `['operator', 'admin', 'billing']`.
- **Admin is a superuser**: admin ⊇ (operator ∪ billing).
- All humans are at least operators; agents have no roles — they are supervised resources only.
- Multiple roles per person: **yes** (roles array, not single enum).
- `human_workers.role` becomes `roles` (array) — stored as JSON text or join table in D1/SQLite (implementation choice, not decided here).

### Permissions matrix

| Action | Operator | + Billing | + Admin |
|---|---|---|---|
| Enter time for self | ✓ | — | — |
| Enter time for supervisees | ✓ | — | — |
| Enter time for non-supervisees | ✗ | ✗ | ✓ |
| Edit/delete own intervals | ✓ | — | — |
| Edit/delete supervisees' intervals | ✓ | — | — |
| Edit/delete any others' intervals | ✗ | ✗ | ✓ |
| View own + supervisees' intervals (time, no money) | ✓ | — | — |
| View ALL intervals | ✗ | ✓ | ✓ |
| Create/edit/archive clients, projects, jobs | ✗ | ✗ | ✓ |
| Set billable_rate | ✗ | ✗ | ✓ |
| View billing view (rates + totals) | ✗ | ✓ | ✓ |
| View honest view (wall-clock) | own + supervisees | all | all |
| Approve/lock timesheets | ✗ | ✓ | ✓ |
| Manage workers (create, archive, assign supervisor) | ✗ | ✗ | ✓ |
| Manage auth users + role assignment | ✗ | ✗ | ✓ |

### Key decisions made

| Decision | Choice | Rationale |
|---|---|---|
| Operator entry scope | Supervisees only (self + supervisor_id subordinates) | supervisor_id from #4 is a hard authorization boundary, not informational |
| Billing role enters time? | Yes — via operator baseline | Billing = view-all + money + approval powers added on top of operator |
| Operators see money? | No — time only | Rates and billable totals hidden from operators (agency-style sensitivity) |
| Multiple roles | Roles array | Founder-type users can hold everything |
| Job/client/project creation | Admin only | Admins own the billing structure; operators log time against existing jobs |
| Rate setting | Admin only | Rate editing = job editing; billing views but never edits |
| Non-operator humans | None — all humans are operators | Every human user is at least an operator (may supervise zero workers) |
| Admin scope | Superuser (⊇ operator ∪ billing) | Confirmed as working assumption, unobjected |

### Edge cases answered

- **Operator editing another operator's entries:** only if that operator is their supervisee (humans can have `supervisor_id` pointing at other humans).
- **Billing creating entries:** yes, own entries only (operator baseline); others' only if admin.
- **Operator self-approval:** no. Approval is billing/admin only.
- **Agents:** no roles; their supervisor (an operator) enters and views their time per the supervisee rules.

### Boundaries deferred

- Approval **flow and granularity** (per-worker per-period? per-job? locking mechanics) → approval-workflow fog item, unblocked once #7 (billing/honest rules) lands.
- Role **enforcement pattern** in BetterAuth (RBAC plugin mapping, middleware checks) → ticket #8.
- Data-model storage of roles array (JSON vs join table) → implementation detail at build time.
