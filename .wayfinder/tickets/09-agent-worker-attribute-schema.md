---
id: 9
title: "Agent worker operational attribute schema"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: [4]
---

## Question

The base agent_workers shape is defined in #4 (model, framework, status). What **operational** attributes does an agent worker need beyond that?

Specifically:
1. **Run/session tracking** — should agent_workers (or intervals logged by agents) carry a `run_id` or `session_id` to tie wall-clock time to a specific agent execution? Is this per-worker, per-interval, or a separate execution entity?
2. **Token/cost metadata** — should token usage or cost data be stored alongside time intervals, or is that out of scope (agent observability platforms handle it)?
3. **Client assignment** — can an agent be assigned to a specific client/project, or is assignment purely through jobs/intervals?
4. **Concurrency limits** — should the schema model how many concurrent jobs an agent can handle? Is that a worker attribute or app-level config?

This is about the data model extension only — agent auto-entry and framework integrations are explicitly out of scope (roadmap).

## Context

- Base agent_workers shape from #4: `worker_id, model, framework, status`.
- Research #2 found that agent frameworks track tokens/latency/cost per call, not billable wall-clock. No product combines timesheet attribution with agent-ops tracking.
- Agent auto-entry is roadmap; human operators enter hours for agents for now.

## Resolution

Closed by wayfinder after grilling with user. All four sub-questions confirmed against the recommended options.

### agent_workers v1 schema (unchanged from #4)

`{worker_id, model, framework, status}` — no operational attributes added in v1.

### Sub-decisions

| Sub-question | Decision | Rationale |
|---|---|---|
| Run/session tracking | **Defer to v2** — separate `agent_executions` table when auto-entry lands | Agent auto-entry is roadmap. When v2 begins planning, model runs as a separate entity that intervals can reference. No schema work in v1. |
| Token/cost metadata | **Out of scope** — observability platforms own this | Research #2 found agent observability platforms track tokens/cost per call. No v1 payoff from coupling with timesheets. |
| Client assignment | **Pure via jobs/intervals** | Agent is a worker; client comes from the jobs they log time on. Matches the existing model; no redundancy. |
| Concurrency limits | **App-level config only** | Concurrency is an operational limit, not data. v1 doesn't enforce; v2 (live timers) can revisit as a config field if needed. |

### Implications

- #4's `agent_workers` shape is final for v1. No follow-on tickets surfaced.
- The `agent_executions` table referenced by the deferred run-tracking decision is **fog**, not a ticket — it'll be ticket-shaped when v2 begins planning. Not added to Not-yet-specified (the v2 destination isn't part of this map).
- No impact on #10 (API design), #11 (reporting), or #12 (approval).

## Status

Closed. Recorded on map as Decision #9.