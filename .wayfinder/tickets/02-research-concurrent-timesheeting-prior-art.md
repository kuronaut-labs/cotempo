---
id: 2
title: "Research: Prior art in concurrent/overlap time tracking"
labels: [wayfinder:research]
status: closed
assignee: wayfinder
blocked-by: []
---

## Question

What existing products, patterns, and data models address concurrent or overlapping time tracking? Surface findings — do NOT recommend.

Investigate:
1. **Existing time-tracking products** — do Toggl, Harvest, Clockify, Timely, Hubstaff, or others support overlapping/concurrent entries? How do they handle it if so? What are their limitations?
2. **AI-agent-specific tools** — any products aimed at tracking AI agent work or concurrent agent operations?
3. **Data models for overlapping intervals** — how do billing or workforce systems model intervals that overlap? What entities and relationships are involved?
4. **UX patterns for concurrent entry** — timeline views, multi-timer interfaces, retroactive batch entry with overlap editing. What patterns exist?
5. **Billing with duplicate attribution** — any products or literature on billing all concurrent jobs for the full overlapped time (not pro-rata split)?

The answer feeds the data model decision (ticket #4) and entry UX decision (ticket #6).

## Resolution

Research completed. Findings written to [.wayfinder/research/02-concurrent-timesheeting-prior-art.md](../research/02-concurrent-timesheeting-prior-art.md).

**Key findings:**
- Most time-trackers assume one timer per worker. Clockify/TimeCamp allow overlaps (framed as multitasking, not billing); Kimai flags overlaps in red. No product bills overlapped time at full value to each job.
- AI-agent frameworks (LangGraph, CrewAI, AutoGen, etc.) track tokens/latency/cost per call, not billable wall-clock. Observability platforms (LangSmith, Langfuse, Helicone) attribute by user/session/prompt. No product combines timesheet attribution with agent-ops tracking — an open niche.
- Dominant data model pattern is *preventing* overlaps (PostgreSQL `EXCLUDE USING gist`, PG18 `WITHOUT OVERLAPS`). Allen's Interval Algebra (13 relations) is the theoretical counterpoint where `overlaps` is first-class.
- UX: Calendar/Gantt block views dominate; Ganttic has the cleanest intentional concurrent-task UX (drag-to-overlap + utilization warnings). No established concurrent-attribution entry pattern exists.
- Duplicate-attribution billing: California Formal Opinion 1996-147 permits full-value concurrent billing *only with disclosure + client consent + reasonableness*. ABA Opinion 93-379 otherwise prohibits it. No product implements this model.
- Literature treats multitasking as a cost (switching cost, cognitive bottleneck). No paper argues for duplicate attribution as a billing primitive.
