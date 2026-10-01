---
id: 27
title: "Assignments & allocation refine the data model and roles"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: []
---

## Question

The assignments plan (`docs/2026-09-18-assignments-and-allocation.md`) introduces an `assignments` table, due dates, allocation minutes, and a future `requireAssignment` enforcement. Record how this refines the standing decisions before code.

## Decision (from plan review)

- **Refines #4 and #9.** #9 said client assignment is "pure via jobs/intervals"; an `assignments` table now exists as planning data. One row per (worker, target), `targetKind` is `'project' | 'job'`; a project assignment implies every live job under it, a job assignment is narrower; effective set = union resolved in `src/lib/allocation.ts`. Allocation is one integer `allocatedMinutes` per assignment (total for the engagement, nullable, null = no cap); no weekly cadence in v1. Due dates are nullable ISO dates on both `projects` and `jobs`; a job due after its project is surfaced as a flag, never rejected.
- **Refines #5 — new abilities:** `assign_worker` (admin only) and `view_assignments` (self + supervisees; billing views all). Admin owns dates and assignments.
- **Refines #7's entry rule with a setting-gated exception (Wave 5, deferred):** with `requireAssignment` on, non-admins may only log to jobs in their effective assignment set; enforcement exempts admin (mirrors #17) and is judged against the target worker's assignments, not the actor's. Default off.
- **Pace** is linear burn from the assignment's creation day to `dueOn`; no due date or no allocation → `'n/a'`.
- **Approver view:** unassigned-entry count is advisory text, not a red flag; `RedFlagInput`'s signature stays fixed (rule 10).

### Implications

- #4/#9: assignment becomes a stored relation, not purely derived.
- #5: ability matrix gains two rows.
- #7: gains one config-gated exception; guard order in CLAUDE.md gains a `requireAssignment` step in Wave 5.
- Migration numbers follow Stage 2 (0007, 0008 — next free).
