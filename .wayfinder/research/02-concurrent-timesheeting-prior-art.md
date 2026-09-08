# Concurrent Timesheeting — Prior Art Research

Research into existing products, patterns, and data models for concurrent or
overlapping time tracking. This document surfaces **facts and patterns only**;
it makes no recommendations.

Key terminology used throughout:
- **Overlapping / concurrent time entries**: two or more time logs whose
  `[start, end)` intervals intersect for the same resource (person, agent,
  room, etc.).
- **Duplicate attribution (full-value billing)**: billing the full value of
  an overlapped time block to each of the jobs/clients that share it — as
  opposed to pro-rata splitting or choosing only one.

---

## 1. Existing Time-Tracking Products

The dominant pattern in the market is **single-timer, no-overlap-by-default**,
with a minority of products that *allow* overlaps but treat them as edge cases
to be cleaned up rather than first-class data.

### Toggl Track
- **Overlap behavior**: Toggl Track **allows overlapping time entries** by
  default. There is no workspace setting to disable overlaps; a community
  thread requesting this (to feed an HR system that cannot handle overlaps)
  was answered with "not currently possible."
  - Source: https://community.toggl.com/t/can-i-disable-overlapping-time-entries-for-a-workspace-or-organisation/749
- Overlaps can occur accidentally when starting a new timer from the calendar
  view on top of a previous entry.
  - Source: https://community.toggl.com/t/overlapping-entries/4984
- The **Timesheet View** has internal logic that actively tries to *avoid*
  creating overlaps: it searches for free slots, prefers reusing
  "System Added Time Entry" placeholders, and will not cross midnight.
  When reducing duration, it prioritizes overlapping entries for deletion.
  - Source: https://support.toggl.com/adding-time-entries-in-timesheet-view
- **Calendar View** shows entries as colored blocks; supports click-and-drag
  creation, split (Starter plan), drag-to-resize, and a "current time"
  indicator. No native concept of layered/stacked overlapping blocks.
  - Source: https://support.toggl.com/en-us/article/tracking-time-in-the-calendar-view-1fftm9r/
- Toggl explicitly markets a **percentage-based timesheet entry** feature
  (enter "50%" → system computes hours from weekly target). This is a form of
  *attribution splitting* at entry time, not concurrent interval logging.
  - Source: https://support.toggl.com/adding-time-entries-in-timesheet-view

### Clockify
- **Overlap behavior**: "By default, Clockify allows overlapping entries
  because many users need flexibility when tracking multitasking."
  - Source: https://clockify.me/help/troubleshooting/permissions/overlapping-entries
- This is positioned as a feature for multitasking, **not** as a billing model.
  The official guidance is to *clean overlaps up* manually via Calendar view
  drag-edges or Detailed Report time editing.
- **Prevention option**: a paid "Force Timer" feature (Pro/Enterprise)
  disables manual entry entirely, so only one live timer can run —
  effectively blocking overlaps by forcing real-time tracking.
  - Source: https://clockify.me/help/troubleshooting/permissions/overlapping-entries
- Clockify staff stated on the forum that "for technical and optimization
  reasons, there are no plans to prevent overlapping time."
  - Source: https://forum.clockify.me/t/overlapping-time/304
- Real customer pain: a forum user reported "significant loss of work hours"
  because Clockify sums overlaps incorrectly for payroll, and support
  "dismissed" the concern. Others requested visual flagging of overlaps
  (e.g. marking in red), referencing **Kimai** as a tool that already does
  this.
  - Sources:
    - https://forum.clockify.me/t/overlapping-time-entries-causing-significant-loss-of-work-hours/6911
    - https://forum.clockify.me/t/feature-request-better-control-on-overlapping-time/1120

### Harvest
- **Overlap behavior**: Harvest is built around a **single manual start/stop
  timer** plus manual duration entry. No published feature for concurrent
  timers or overlap handling; the product is "client billing software" focused
  on time-to-invoice flow.
  - Sources:
    - https://www.getharvest.com/resources/glossary/time-tracking
    - https://toggl.com/blog/harvest-vs-hubstaff (Harvest: "Manual timer,
      browser extension, mobile app"; no monitoring/concurrency features)
- Harvest's strength is the billing pipeline (tracked hours → invoice →
  Stripe/PayPal payment), not interval modeling.

### Hubstaff
- Timer-based tracking with idle detection, screenshots, activity %, and
  optional GPS/geofencing for automated clock-in/out.
  - Source: https://hubstaff.com/harvest-alternative
- No documented support for concurrent/overlapping timers; the model is one
  worker, one timer, with workforce-monitoring metadata layered on top.

### Timely
- **AI automatic tracking**: eliminates manual timers by background-capturing
  app/website/calendar activity, then turning it into time entries for review.
  - Sources: https://www.timely.com/, https://timesentry.ai/compare/harvest-vs-timely
- Positioned as "privacy-first, no screenshots or mouse tracking." Handles
  "thousands of concurrent users" (concurrency at the *platform* scale, not
  per-user interval concurrency).
- No documented per-user overlapping-entry model.

### TimeCamp
- **Explicit overlap setting**: TimeCamp has a toggle "Do not allow
  overlapping entries" in tracking settings. When enabled, "only one entry
  can be created within the defined timeframes" (e.g. can't add a 3pm entry
  when one runs 2–4pm). When disabled, overlaps are permitted.
  - Sources:
    - https://help.timecamp.com/help/time-tracking-settings
    - https://www.timecamp.com/faq/mobile-and-remote-work/how-to-handle-overlapping-time-entries-in-timecamp/
- Also offers "Block edit and delete Time Entries" and "Count time logged
  only by desktop application" to force real-time-only logging.

### Everhour
- Manual, PM-tool-embedded tracking (timers inside Asana/Jira/ClickUp/etc.).
  Model is one task at a time; no documented concurrent-timer feature.
  - Source: https://www.timecamp.com/blog/timecamp-vs-everhour/

### Tick
- Notable explicit feature: "Toggle between multiple timers if you're
  multitasking throughout the workday" — one of the few products that markets
  multi-timer multitasking as a feature.
  - Source: https://clickup.com/blog/rescuetime-alternatives

### Kimai (open source)
- Referenced by Clockify forum users as the tool that **flags overlapping
  entries visually (in red)** — the prior-art example for overlap detection UX
  in the SMB time-tracking space.
  - Source: https://forum.clockify.me/t/feature-request-better-control-on-overlapping-time/1120

### Oracle Cloud / enterprise workforce systems
- An Oracle Cloud Customer Connect thread requests prevention of "duplicate
  or overlapping entries of time on the same day at the point of time entry"
  and blocking submission-for-approval if overlaps exist — indicating that
  enterprise HCM systems treat overlaps as a compliance problem to block.
  - Source: https://community.oracle.com/customerconnect/discussion/686501/how-to-stop-duplicate-overlap-of-time-entries

### Cross-cutting observations
- **Most products assume a single timeline per worker.** Where overlaps are
  allowed (Clockify, Toggl, TimeCamp), they are treated as data quality
  issues, not billable concurrency.
- **No surveyed product bills overlapped time at full value to each job.**
  Overlaps are either prevented, tolerated-then-cleaned, or summed naively
  (causing payroll errors).
- The split/attribution concept appears only as Toggl's *percentage-based
  timesheet entry*, which is a manual apportionment tool, not interval overlap.

---

## 2. AI-Agent-Specific Tools

This is an emerging space. There is **no established product that tracks AI
agent work as "concurrent timesheets."** What exists falls into two camps:
**agent orchestration frameworks** (which model concurrent execution but
track tokens/latency, not billable time) and **LLM observability platforms**
(which capture per-call cost/latency but not multi-job attribution).

### Agent orchestration frameworks (2026 landscape)
The three dominant frameworks plus emerging ones:

- **LangGraph** (LangChain) — graph-based orchestration with typed state,
  checkpointing, time-travel debugging. Most production-hardened; LangSmith
  gives "full trace visibility into every node execution, token count,
  latency, and tool call." 57% of surveyed orgs have agents in production.
  - Sources:
    - https://agentmarketcap.ai/blog/2026/04/11/langgraph-autogen-crewai-dspy-multi-agent-orchestration-2026
    - https://radar.firstaimovers.com/langgraph-vs-langchain-crewai-autogen-2026
- **CrewAI** — role-based multi-agent collaboration; fastest time-to-production
  for role decompositions (researcher → writer → reviewer). 30–60% faster
  wall-clock and 34% fewer tokens than AutoGen on structured tasks.
  - Source: https://agentmarketcap.ai/blog/2026/04/11/langgraph-autogen-crewai-dspy-multi-agent-orchestration-2026
- **AutoGen / AG2** — conversational multi-agent. Microsoft has moved active
  development to **Microsoft Agent Framework** (successor to Semantic Kernel
  *and* AutoGen); AutoGen itself is now in maintenance mode.
  - Sources:
    - https://pub.towardsai.net/langgraph-vs-crewai-vs-autogen-which-ai-agent-framework-should-your-enterprise-use-in-2026-3a9ebb407b09
    - https://the-agent-report.com/2026/07/ai-agent-frameworks-comparison-2026-langgraph-crewai-autogen/
- **OpenAI Agents SDK** — attracting developers via low-friction handoffs API.
- **Google ADK** — Gemini-ecosystem, graph-based runtime with routing/loops.
- **DSPy** (Stanford) — declarative prompt optimization.
  - Sources:
    - https://agentmarketcap.ai/blog/2026/04/11/langgraph-autogen-crewai-dspy-multi-agent-orchestration-2026
    - https://the-agent-report.com/2026/07/ai-agent-frameworks-comparison-2026-langgraph-crewai-autogen/

Key fact for this project: **these frameworks model concurrent/parallel
agent execution natively** (parallel branches, concurrent nodes, swarms), but
their built-in tracking is **per-execution-step token/latency/cost**, not
"how much billable wall-clock time did agent X spend on job Y while also
serving job Z."

### LLM / agent observability platforms
The 2026 observability market (15+ tools). Core capabilities across the
category: **distributed tracing, cost attribution by feature/user/prompt,
token usage, latency p50/p95/p99, eval pipelines, prompt versioning.**

| Tool | Model | Notable for |
|---|---|---|
| **LangSmith** | LangChain-native SDK | Deepest LangGraph traces; per-node token/cost; eval suite |
| **Langfuse** | Open-source (MIT), OTel-native, self-hostable | Framework-agnostic; cost/usage/latency dashboards; per-user cost attribution |
| **Helicone** | Proxy-based (one URL change) | Zero-instrumentation cost/latency; caching (20–60% savings); sees request/response, not internal reasoning |
| **Arize Phoenix** | SDK | Drift + embedding analysis |
| **Datadog LLM Observability** | APM-integrated | Agent decision-path graphs, infinite-loop detection, span capture across providers |
| **AgentOps** | SDK | Agent graphs, sampling, token & cost tracking, masking |
| **Galileo** | SDK | Cost/latency + real-time safety/compliance checks |
| **Braintrust** | Eval-first | CI/CD quality gates |
| **Laminar** | Framework-agnostic | Cross-framework span/cost/latency comparison |
| **W&B Weave / Comet Opik** | Experiment-tracking lineage | Bridges ML experiment → production |
| **Maxim AI** | — | Hallucination prevention / responsible-AI compliance |
| **Honeycomb for AI** | APM | Bring AI monitoring into existing Honeycomb infra |

- Sources:
  - https://aimultiple.com/agentic-monitoring (15-tool survey, Aug 2026)
  - https://latitude.so/blog/best-ai-observability-tools-agents-2026
  - https://baeseokjae.github.io/posts/langsmith-langfuse-helicone-comparison-2026
  - https://geodocs.dev/tools/langfuse-vs-langsmith-vs-helicone-agent-observability
  - https://www.contextstudios.ai/guides/best-ai-agent-observability-tools-2026
  - https://www.metabase.com/metrics/token-usage

### Gap relevant to concurrent timesheeting
- Observability tools attribute cost **by user/session/feature/prompt**, not
  by "concurrent job/portfolio item." A single agent serving multiple
  concurrent users appears as multiple traces; nothing models "agent X was
  simultaneously working on job A and job B from 10:00–11:00."
- **Token usage** is the unit, not **wall-clock time.** Metabase's LLM
  analytics metric explicitly defines token usage as "the raw material of
  every LLM cost and capacity question: spend is tokens × price."
  - Source: https://www.metabase.com/metrics/token-usage
- **No product found** that combines human-timesheet concepts (billable
  hours, client/job attribution, overlap-aware intervals) with AI agent
  operations tracking. This is an open niche.

---

## 3. Data Models for Overlapping Intervals

### The dominant pattern: *prevent* overlaps via constraints
Most database literature and workforce/billing schemas treat overlapping
intervals as a **data-integrity violation** to be blocked, not modeled.

**PostgreSQL EXCLUDE constraints (the canonical technique)**
- `EXCLUDE USING gist (tsrange(start, end) WITH &&)` prevents any two rows
  from having overlapping time ranges — "like UNIQUE, but for ranges."
- With a partitioning column: `EXCLUDE USING gist (resource_id WITH =,
  tstzrange(start, end) WITH &&)` requires the `btree_gist` extension.
- Buffer/gap enforcement is possible via an `IMMUTABLE` function
  (`add_buffer(during, '1 hour')`) inside the EXCLUDE clause.
- Adjacency prevention uses the `-|-` operator in a second EXCLUDE constraint.
- Half-open `[start, end)` semantics are standard and avoid the
  "ends-at-5pm vs starts-at-5pm" false overlap.
  - Sources:
    - https://www.red-gate.com/simple-talk/databases/postgresql/overlapping-ranges-in-subsets-in-postgresql/
    - https://www.cybertec-postgresql.com/en/postgresql-exclusion-constraints-beyond-unique
    - https://dev.to/rozhnev/exploring-postgresqls-exclude-operator-advanced-data-constraints-2k60
    - https://blog.danielclayton.co.uk/posts/overlapping-data-postgres-exclusion-constraints/

**PostgreSQL 18 `WITHOUT OVERLAPS` (SQL:2011 standard)**
- PG18 introduces cleaner syntax: `PRIMARY KEY (room_id, booking_period
  WITHOUT OVERLAPS)` replacing the cryptic GiST EXCLUDE. Also adds temporal
  foreign keys with `PERIOD`. Enforces rules like "employees can't be in two
  places at once" at the DB layer.
  - Source: https://betterstack.com/community/guides/databases/postgres-temporal-constraints/

### When overlaps *are* allowed: temporal/data-warehouse patterns
- **Bitemporal modeling** — "Overlapping Time Periods Detection" is an
  explicit pattern in the Software Patterns Lexicon for time-based data
  integrity, using DB queries + constraints + app logic to *detect and
  prevent* temporal conflicts.
  - Source: https://softwarepatternslexicon.com/bitemporal-modeling/temporal-data-patterns/overlapping-time-periods-detection/
- **SCD Type 2 failure mode** — In slowly-changing dimensions, "for any
  business key you must never have two rows marked as current simultaneously,
  and effective periods must never overlap." Overlaps here are a *bug class*
  ("the overlap catastrophe"), detected via audit queries.
  - Source: https://www.systemoverflow.com/learn/data-modeling-schema/slowly-changing-dimensions/scd-failure-modes-overlapping-periods-and-late-facts

### Billing-system schemas (interval handling)
Surveyed multi-tenant SaaS billing schemas (Stripe/Chargebee/Zuora-style)
separate three layers:
- **Identity** (who the user is) — separate from
- **Access** (subscriptions/lifecycles, with `current_period_start/end`) —
  separate from
- **Financial** (immutable, append-only ledger).
- **Double-entry bookkeeping ledger**: "never overwrite a balance column."
  Every transaction is an immutable row; balance = SUM of debits/credits.
  This is the standard for money but says nothing about *time interval
  overlap* — billing periods are non-overlapping by construction.
  - Sources:
    - https://dev.to/risky_egbuna_67090a53aaaa/architecting-multi-tenant-billing-engines-a-database-schema-guide-2b4h
    - https://akcoding.com/projects/production-ready-billing-subscription-database-schema/
    - https://dba.stackexchange.com/questions/61424/conceptual-data-model-for-a-billing-system

### The theoretical foundation: Allen's Interval Algebra (1983)
- James F. Allen defined **13 basic relations** between two time intervals
  that are *distinct, exhaustive, and qualitative*: `before`, `after`,
  `meets`, `met-by`, `overlaps`, `overlapped-by`, `during`, `contains`,
  `starts`, `started-by`, `finishes`, `finished-by`, `equals`.
- Forms a relation algebra with a composition table for reasoning. Used in
  planning/scheduling, temporal databases, multimedia, molecular biology,
  natural-language processing.
- `overlaps`/`overlapped-by` are *first-class relations* — the algebra
  explicitly models concurrency rather than forbidding it.
- Implementations exist in Haskell (`interval-algebra`), Python (`qualreas`),
  Java, TerminusDB (WOQL `interval_relation`), OWL-Time.
  - Sources:
    - https://en.wikipedia.org/wiki/Allen%27s_interval_algebra
    - https://ics.uci.edu/~alspaugh/cls/shr/allen.html
    - https://arxiv.org/pdf/1909.01128v1
    - https://terminusdb.org/docs/woql-interval-algebra
    - https://hackage.haskell.org/package/interval-algebra

### Scheduling-first tools that *embrace* overlaps
- **Ganttic** explicitly supports scheduling overlapping tasks for a resource:
  "drag and drop a Task to a Resource... add another Task in the same time
  period. This will create concurrent Tasks. You can add as many overlapping
  Tasks as you like." Optional **Resource Utilization Graphs** warn of
  overallocation (visual cue, not a hard block).
  - Source: https://help.ganttic.com/hc/en-us/articles/11174244304913-Overlapping-Tasks
- **OnePager** has a "Stagger Overlapping Tasks" setting that auto-creates
  extra rows when two tasks are scheduled simultaneously.
  - Source: https://www.onepager.com/support/whats-new/gantt-timeline.html
- Implication: resource-scheduling/Gantt tools model concurrency (a person
  double-booked) as *overallocation to flag*, whereas time-tracking tools
  model it as *data error to prevent*.

---

## 4. UX Patterns for Concurrent Time Entry

### Calendar / timeline block view (most common)
- **Toggl Track Calendar View**: colored blocks per entry, click-and-drag to
  create/resize, "current time" purple line, zoom levels (5- or 10-min
  increments). Overlaps display as visually layered blocks but are not
  first-class.
  - Source: https://support.toggl.com/en-us/article/tracking-time-in-the-calendar-view-1fftm9r/
- **Clockify Calendar View**: overlapping blocks "layered next to each
  other"; fix by dragging top/bottom edges.
  - Source: https://clockify.me/help/troubleshooting/permissions/overlapping-entries

### Gantt views (scheduling-oriented)
- Gantt charts natively depict overlapping tasks on a timeline but, per a
  LogRocket analysis, "struggle to effectively manage resources" for
  concurrent work — their linear structure "may not accurately reflect the
  dynamic nature of resource management" when team members juggle multiple
  responsibilities simultaneously.
  - Source: https://blog.logrocket.com/ux-design/reimagining-gantt-charts-ux-project-management/
- **Ganttic** (above) is the cleanest example of *intentional* concurrent-task
  UX: drag-to-overlap, with utilization graphs as the warning layer.
- **Zoho Creator Gantt extension** explicitly visualizes "overlapping tasks,
  milestones, and deadlines."
  - Source: https://help.zoho.com/portal/en/kb/creator/pre-built-extensions/articles/gantt-chart-extension

### Multi-timer interfaces
- **Tick**: "Toggle between multiple timers if you're multitasking" —
  parallel running timers as a marketed feature.
  - Source: https://clickup.com/blog/rescuetime-alternatives
- This is the closest existing UX to "I'm working on multiple things at
  once," but it's framed as *switching* between timers, not *running them
  concurrently* for overlapping attribution.

### Visual flagging of overlaps (detection UX)
- **Kimai** flags overlapping entries in red (referenced by Clockify users as
  the model to emulate).
  - Source: https://forum.clockify.me/t/feature-request-better-control-on-overlapping-time/1120

### Dense-data timeline patterns (from general UX literature)
- For many events: **zoomable time scales**, **grouping/clustering**,
  **filtering/search**, **progressive disclosure**.
  - Source: https://www.eleken.co/blog-posts/timeline-ui-design
- Timeline pattern components: timeline axis, event marker, event content,
  time label, optional grouping/filters.
  - Source: https://uxpatterns.dev/patterns/data-display/timeline

### Retroactive batch entry
- **Toggl** "Copy Last Week" (display last week's projects, or copy all
  entries/projects) and **Everhour** bulk select/move/delete of time entries
  are the closest patterns to "retroactive batch entry with overlap editing" —
  but neither supports overlap-aware editing.
  - Sources:
    - https://support.toggl.com/adding-time-entries-in-timesheet-view
    - https://everhour.com/blog/bulk-actions-for-time-entries/

### Split-screen / side-by-side
- No established product pattern found for split-screen concurrent time
  entry. This appears to be an open UX direction.

---

## 5. Billing with Duplicate Attribution (Full-Value Concurrent Billing)

This is the most legally loaded area. **The default across professional
services is that overlapping time must NOT be billed at full value to each
job** — it is either billed to one client or split. However, there is a
narrow, documented **exception with conditions**.

### The legal profession's rule (the clearest prior art)
- **ABA Model Rule 1.5**: legal fees must be "reasonable" — the foundation
  for prohibiting double billing.
  - Source: https://www.lawpay.com/about/blog/double-billing/
- **ABA Formal Opinion 93-379** (quoted directly by multiple sources):
  > "A lawyer who spends four hours of time on behalf of three clients has
  > not earned twelve billable hours. A lawyer who flies for six hours for
  > one client, while working for five hours on behalf of another, has not
  > earned eleven billable hours."
  - Source: https://www.leanlaw.co/blog/5-billing-practices-that-can-lead-to-ethical-grievances-and-how-to-avoid-them/
- Standard scenarios and "ethical solutions" prescribed:
  - **Travel + concurrent work**: bill travel to client A *or* work to
    client B, not both; alternatively split proportionally.
  - **Recycled research**: bill full time to first client only; subsequent
    clients pay only for customization.
  - **Simultaneous activities**: "Choose one client to bill. Never bill
    multiple clients for the same clock time."
  - Sources:
    - https://www.americanbar.org/groups/law_practice/resources/law-technology-today/2023/what-lawyers-need-to-know-about-double-billing/
    - https://www.clio.com/blog/double-billing/
    - https://attorneyprotective.com/billing/the-double-billing-dilemma

### The narrow exception: concurrent billing *is* permitted with conditions
- **California Formal Opinion 1996-147** (the key document for this project):
  an attorney "may not bill a full hourly rate to more than one client for
  the same time period... **unless** the attorney has: (1) disclosed this
  billing practice at the outset of the relationship; (2) obtained client
  consent; and (3) made sure that the fee charged to each client is not
  'unconscionable'."
  - Source: https://www.calbar.ca.gov/Portals/0/documents/ethics/Opinions/1996-147.htm
- This is the clearest prior art for **duplicate attribution with informed
  consent and reasonableness guards** — exactly the "bill overlapped time at
  full value to each job" concept, but gated by disclosure + consent +
  reasonableness.
- General consensus quote: "Most commentators agree that if an attorney
  completes work for more than one client at the same time, the attorney
  should bill only one client and the other clients should benefit from the
  attorney's efficiency for free."
  - Source: https://attorneyprotective.com/billing/the-double-billing-dilemma

### Adjacent concepts
- **Block billing** (lumping multiple tasks into one entry) is *legal* if
  transparent, but courts regularly **reduce fees 20–30%** for block-billed
  invoices. This is a transparency problem, not a concurrency problem.
  - Source: https://www.leanlaw.co/blog/5-billing-practices-that-can-lead-to-ethical-grievances-and-how-to-avoid-them/
- **Technology safeguards** recommended for ethical billing: "overlap
  detection that flags concurrent time entries," separate travel-time
  tracking, research-library tracking for reused work, automatic warnings
  for suspicious patterns.
  - Source: https://www.leanlaw.co/blog/5-billing-practices-that-can-lead-to-ethical-grievances-and-how-to-avoid-them/

### Outside legal: no prior art found for full-value concurrent billing
- Surveyed time-tracking and billing products either prevent overlaps, clean
  them up, or sum them naively (causing errors). **No product markets
  "bill overlapped time at full value to each job."**
- The economics literature on multitasking (§6) treats concurrent work as a
  *productivity cost* to be minimized, not a *billable opportunity* to be
  maximized.

---

## 6. Academic / Industry Literature

### Cognitive psychology: multitasking is largely rapid task-switching
- **APA "Multitasking: Switching costs" (2006)**: what people perceive as
  multitasking is neurologically **rapid task-switching** with measurable
  "switch costs" — one part from adjusting mental control settings, another
  from carry-over of previous settings. Surprisingly, switching to the *more
  habitual* task can be harder. Dual-task interference (Pashler, 1994)
  identifies a "stubborn bottleneck" encompassing action choice and memory
  retrieval.
  - Sources:
    - https://www.apa.org/topics/research/multitasking
    - ResearchGate: Pashler "Dual-Task Interference in Simple Tasks" (1994)
- **Bridging concurrent multitasking, task switching, and complex
  multitasking** (Journal of Experimental Psychology: Human Perception &
  Performance, 2026, 51(7), 875–894): individual-differences study across 9
  paradigms (224 students) examining the unity and separability of
  multitasking ability — distinct but related cognitive mechanisms.
  - Source: https://psycnet.apa.org/record/2026-13784-001
- **Comparative analysis (2025)**: multitasking incurs "significant cognitive
  costs — increased completion time, higher error propensity, diminished
  memory retention." Less detrimental when one task is highly automated
  (walking + podcast) or tasks use distinct neural pathways. Conclusion:
  **monotasking remains superior for complex goal-oriented work.**
  - Sources:
    - https://berkeleypublications.com/bjmse/article/view/595
    - https://www.researchgate.net/publication/396454269

### Economics: multitasking as a labor/incentives problem
- **Holmstrom & Milgrom (1991)** — the foundational multi-task principal-agent
  model: tasks on the same worker should have similar measurability, or the
  worker over-invests in the measurable task. Directly relevant to *how
  concurrent work is measured and incentivized*.
  - Cited in https://www.cambridge.org/core/journals/experimental-economics/article/multitasking/0D8CADEA4C6F6ACDBB1E51615B5D67DA
- **Buser & Peter, "Multitasking" (Experimental Economics, 2012)**:
  experimental study of multitasking (switching between ongoing tasks) in a
  modern work environment; finds gender differences in multitasking
  performance and preference.
  - Sources:
    - https://www.cambridge.org/core/journals/experimental-economics/article/multitasking/0D8CADEA4C6F6ACDBB1E51615B5D67DA
    - https://link.springer.com/article/10.1007/s10683-012-9318-8
- **Batt & Gallino, "Multitasking over Time" (Wharton, 2025)** — the most
  directly relevant empirical paper: granular data from a live-chat customer
  service center. Key findings:
  - Both multitasking and **multibranding** (agents handling multiple brands
    simultaneously) **reduce agent performance.**
  - Drawing on activation theory: **prolonged** high multitasking loads cause
    *further* deterioration (time-dependent, not static).
  - Multitasking **reduces customer sentiment even though customers are
    unaware** of the agent's workload.
  - Simulation shows widely used load-balancing heuristics are suboptimal;
    proposes a new task-assignment strategy accounting for temporal dynamics.
  - Source: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4823942
- **Bendoly, Swink & Simpson, "Prioritizing and Monitoring Concurrent Project
  Work: Effects on Switching Behavior" (Production and Operations
  Management, 2014)** — concurrent project work and switching behavior.
  - Cited in https://www.cambridge.org/core/journals/experimental-economics/article/multitasking/0D8CADEA4C6F6ACDBB1E51615B5D67DA

### Billing psychology
- **Hansen, "The Psychology of Billing" (Contemporary Accounting Research,
  2018)**: examines contextual factors in tax professionals' billing
  decisions — how billing choices are shaped by context, not pure time.
  - Source: https://onlinelibrary.wiley.com/doi/full/10.1111/1911-3846.12323
- **Werthschulte, "Present focus and billing systems: 'pay-as-you-go' vs
  'pay-later'" (Journal of Economic Behavior & Organization, 2023)**: billing
  *system design* affects behavior via present-focus/time preferences.
  - Cited in https://ideas.repec.org/a/eee/beexfi/v23y2019icp75-83.html

### Summary of the literature stance
- Across cognitive psychology, economics, and operations, **concurrent
  multitasking is treated as a cost** (switching cost, bottleneck, error
  rate, sentiment degradation) **to be minimized via better task allocation** —
  not as billable value to be captured.
- The lone exception is the **legal-ethics carve-out** (California 1996-147)
  permitting concurrent full-value billing *with informed consent and
  reasonableness*.
- No academic paper was found that argues for or models *duplicate
  attribution of overlapped time as a billing primitive*.

---

## Cross-Cutting Summary of Patterns

| Dimension | Dominant pattern | Notable exceptions |
|---|---|---|
| Time-tracking products | Single timer, prevent or clean up overlaps | Clockify/TimeCamp *allow* overlaps (as multitasking flexibility); Tick markets multi-timer toggle; Kimai flags overlaps in red |
| AI agent tools | Per-call token/cost/latency tracing; no "concurrent job timesheet" concept | LangGraph/CrewAI model concurrent execution but track tokens, not billable wall-clock |
| Data models | EXCLUDE constraints / `WITHOUT OVERLAPS` to *prevent* overlaps | Allen's Interval Algebra models `overlaps` as a first-class relation; Ganttic stores concurrent tasks per resource with utilization warnings |
| UX | Calendar blocks / Gantt; overlaps shown as layered blocks to fix | Ganttic drag-to-overlap + utilization graphs; Kimai red-flag detection; Toggl percentage-based entry (manual split) |
| Billing | Overlaps → bill one client OR pro-rata split; never full-value to each | **California Formal Opinion 1996-147**: full-value concurrent billing permitted *with disclosure + consent + reasonableness* |
| Literature | Multitasking = cognitive/economic *cost* to minimize | Holmstrom-Milgrom multi-task incentives; Batt-Gallino temporal dynamics of multitasking degradation |

### Gaps / open niches surfaced (facts, not recommendations)
- No product combines human-timesheet attribution (billable hours, client/job)
  with overlap-aware intervals and AI-agent operations tracking.
- No product markets "bill overlapped time at full value to each job."
- No UX pattern exists for *intentional* concurrent-attribution entry (only
  for preventing/detecting/cleaning overlaps).
- The legal-ethics literature is the only domain that has formally reasoned
  about concurrent full-value billing — and it does so to *constrain* it.
