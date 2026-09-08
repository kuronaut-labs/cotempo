---
id: 13
title: "v1 entry UX revision: retro form only, timeline drawing deferred to v2"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: [6]
---

## Question

#6 locked "timeline primary + retro form precise-entry path, live timers deferred to v2." User has now narrowed v1 entry further: "the user will add their start and end times manually."

Does this revision also defer timeline drawing to v2, leaving only the retro form for v1 entry?

## Resolution

Confirmed: v1 entry UX = **retro form only** (typed start/end via the prototype's Model C).

### v1 scope (revised)

- Single entry surface: retro form — worker, job, start, end, Add.
- Day view of self + supervisees' intervals (read-only) with a mini-strip showing where overlaps land.
- Same-job overlap blocked at entry (already wired in prototype).

### Deferred to v2 (alongside live timers)

- Timeline drawing (drag on lane to create/extend blocks) — was #6's primary.
- Live timers (start/stop clocks with concurrent running) — already deferred in #6.
- Both add cleanly: data model (#4) supports `end=null` for live timers; timeline is purely a view layer over intervals, so v2 can layer it on without schema changes.

### Implications

- **#11 (reporting / admin dashboard)** — the timeline Gantt visualization now belongs to reporting views only. It's the only spatial timeline in v1, because entry has none. Reporting's importance as the place overlap is visualized spatially grows.
- **Prototype (prototypes/entry-ux.html)** — keep as v2 reference. Not a v1 build target. The retro form (Model C) and its day-math trio + same-job-block logic are what carries forward to the v1 build.
- **Build scope shrinks** — form-based entry + day-math chip trio + mini-strip is the entire entry experience. Day view (read-only list per supervisee + add button) is the navigation shell.

## Status

Closed. Recorded on map as Decision #13. #6's gist updated to point at #13.