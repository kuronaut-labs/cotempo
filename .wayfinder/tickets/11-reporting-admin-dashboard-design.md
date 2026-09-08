---
id: 11
title: "Reporting / admin dashboard design"
labels: [wayfinder:prototype]
status: closed
assignee: wayfinder
blocked-by: [4, 5]
---

## Question

What do the reporting and admin dashboards show, and what do they look like?

With data model (#4) and roles (#5) locked, design the reporting surfaces:

1. **Admin dashboard** — what does an admin need at a glance? Worker roster (humans + agents, supervision structure), client/project/job structure, rates, overall utilization?
2. **Billing view reports** — per-client billable totals (duplicate attribution), honest view (wall-clock) for reconciliation, overlap premium visibility. Exports (CSV/PDF) needed?
3. **Operator view** — own + supervisees' time, no money. Utilization of supervisees (wall-clock vs concurrent)?
4. **Charts** — timelines, utilization bars, per-client breakdowns. What visualizations earn their place?

This is a **prototype ticket**: produce a cheap, rough artifact (wireframes or a throwaway HTML mock) for the user to react to — not a full design spec. Consult the frontend-design skill.

## Context

- Data model (#4): intervals = single truth; billing view = duplicate attribution sum; honest view = union of intervals per worker (wall-clock). Overlap premium = billing − honest.
- Roles (#5): operators see time only (no rates/totals); billing sees all intervals + money + approves; admin sees everything and manages structure.
- Prior art (research #2): calendar/Gantt block views dominate; Ganttic's utilization graphs are the cleanest concurrent-task visualization; no established concurrent-attribution reporting pattern exists.
- The entry UX model (#6) is still open — reporting design should stay decoupled from entry UX decisions where possible.

## Resolution

Closed by wayfinder after prototype was built and reviewed. User said "continue" with no specific changes — design locked as shown.

### Artifact

`.wayfinder/prototypes/reporting-ux.html` (served at http://localhost:8766/reporting-ux.html). Three tabs:

**A · Admin** — KPI strip (workers / structure / billable today / premium / utilization), worker roster with utilization bars, today's concurrent-effort bars (overlap hatching from entry-ux), client→project→job tree with rates.

**B · Billing** — period selector, per-client reconciliation table (billable/wall-clock/premium trio), reconciliation bars, org-total trio, export CSV/PDF buttons.

**C · Operator** — self + supervisees lanes with day-math chip per lane (no money), read-only mini-timelines.

### Signature

The **reconciliation trio** (billable / honest / premium) shows up everywhere a number is shown. This encodes the #7 disclosure posture (CA 1996-147 — overlap premium IS the disclosure) directly into the UI surface, so approvers and reviewers see all three views simultaneously rather than having to compute them.

### Tokens

Extends entry-ux (#6/#13) — same ink/panel/job colors, same fonts (Space Grotesk / Inter / IBM Plex Mono). Consistent visual identity across entry and reporting surfaces.

### Exports

- **CSV** — intervals + derived trio per row (operator, client, project, job, start, end, wall-clock minutes, billable minutes, overlap premium minutes, dollar amount).
- **PDF** — period invoice per client (header with client + period, line items per job, reconciliation trio footer).

### Out of scope (ruled out during build)

- Client-facing report views — no client portal (roadmap)
- Real-time / live charts — v1 is period snapshots only
- Custom report builder — fixed report set in v1

### Implications

- No impact on #4 (data model) — reporting is derived from intervals + jobs.
- No impact on #10 (API design) — reporting tabs read via existing server-fn conventions.
- Pairs with #12 (approval workflow) — Billing tab is where approval happens; reconciliation trio is the input to approval decisions.
- Token system continuity with #6/#13 means frontend implementation can share CSS variable definitions across entry and reporting routes.

## Status

Closed. Recorded on map as Decision #11.
