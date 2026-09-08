---
id: 6
title: "Entry UX model: timeline, timer, or retroactive"
labels: [wayfinder:prototype]
status: closed
assignee: wayfinder
blocked-by: [2]
---

## Question

What is the primary interaction model for entering time in a concurrent timesheeting platform?

The operator supervises multiple workers (humans + agents) and logs their time. The core challenge: work is concurrent — multiple jobs overlap in time. The UX must make capturing this **easy, simple, and modern**.

Three candidate models to prototype and react to:
1. **Live timer with switching** — start a timer for a job, switch to another without stopping the first (overlaps are explicit). Visual: active timers sidebar.
2. **Timeline drawing** — a horizontal timeline where you draw/extend blocks for each worker x job. Overlaps are spatially obvious. Visual: Gantt-like view per worker.
3. **Retroactive batch entry** — after the fact, select a worker, log their intervals for the day with overlap-aware editing. Visual: form-based or compact timeline.

Make a cheap, rough prototype (wireframe, mock, or stub) of each model and react to them with the user. The prototype should show how overlaps are captured and displayed.

Consult the prior art research (ticket #2) for existing UX patterns, and the frontend-design skill for aesthetic direction.

## Resolution

Interactive prototype built and verified: **`.wayfinder/prototypes/entry-ux.html`** (all three models in one page, live day-math in each, rules from #4/#5/#7 wired in — same-job overlap blocked, premium always visible). User reacted; all recommendations accepted.

### Primary model (v1): timeline + retro form

- **Timeline is the main entry surface** — draw/extend/move blocks on worker lanes; overlaps are spatial. The **retro form is the precise-entry path**: click a block or empty range → type exact times.
- **Live timers NOT in v1 UX** — deferred to v2. Rationale: timers only help when capture happens at work-start, and agent time is usually logged after review. The data model supports `end=null` running timers regardless, so v2 is additive.
- **Day view primary**, with day navigation and a week summary strip above for review. Week is not the entry surface.
- **Lanes = self + all supervisees** (humans and agents) — supervision is the product's core; agents need a human entering their time anyway.

### Overlap visualization (fog item — resolved here)

- **Hatched seam on the intersection + ×N depth tag + per-lane premium line + day-math chip trio** (wall-clock / effort / premium) everywhere. Same treatment reused in reporting views (#11).

### Interaction details carried to build

- Drag uses a coarse 5-min snap as an affordance; exact minutes come via the retro-form edit path (consistent with #7's exact-minutes rule — snap is UX, not data policy).
- Same-job overlap is refused at entry with the billing-error message ("bills one client twice for the same minutes"), as prototyped.
- The prototype's token system (ink-dark console, job-color identity palette, mono time values, Space Grotesk/Inter/Plex Mono) is the aesthetic starting point for the real app — consult frontend-design skill again at build time.

## Status

Closed. With this, all six original destination decisions are locked (stack #3, data model #4, roles #5, entry UX #6, billing rules #7, auth #8). Remaining tickets (#9–#12) are follow-on depth.
