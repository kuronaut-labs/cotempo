# Master Plan — sequence of work

> **For agentic workers:** this file is the index. Work one stage at a time, in order. Inside a stage, follow the linked plan task by task with the gate in `CLAUDE.md`. Do not start a stage while the previous one has a red gate or an unmerged branch. Tick the stage box here only when its plan's Done Criteria hold and its wrap-up commit exists.

Date: 2026-09-18. Base: `main` at `48adfca`. Convention from `0066612`: a plan document is deleted once its work is merged, so this index also records what has already gone.

## Already done

| Plan | State |
|---|---|
| `2026-09-07-concurrent-timesheeting-v1.md` | shipped (Phases 1–8); read-only reference |
| Settings, positions | shipped (`a1cb4b5`, `ecf7d06`) |
| `2026-09-17-leave-management.md` | shipped (`cd09886` … `00b5192`). The document's checkboxes were never ticked; delete it in Stage 0. |

## Stages

Each stage names the plan, the waves or tasks it covers, why it sits here, what it needs from earlier stages, and what it hands forward.

### Stage 0 · Housekeeping (S)

- [ ] Delete `docs/2026-09-17-leave-management.md` (shipped; keeps the "finished plans are removed" convention).
- [ ] Add `.playwright-mcp/` to `.gitignore` (screenshot scratch from the UX review).
- [ ] Record the `.wayfinder` tickets the four plans ask for, so decisions exist before code refines them:
  - assignments table refines #4/#9; #5 gains `assign_worker`, `view_assignments`; #7 gains a setting-gated exception (from `2026-09-18-assignments-and-allocation.md`).
  - `clients` contact columns + `client_contacts` refine #4; #5 gains `edit_client_contacts` (admin) / `view_client_contacts` (all); #11 gains entity pages (from `2026-09-18-clients-and-projects-pages.md`).
  - vocabulary decision (entry / Overlap / On the clock) and the "overlap emphasised when non-zero" call (from `2026-09-18-entry-ux-pass.md`, Locked Decisions 1 and 3).
- [ ] Resolve the open contract gap in `CLAUDE.md` ("clips a midnight-crossing interval …" in `phase4-intervals.contract.test.ts`): reviewer picks "fix the expected trio" or "move `iv('07')`". Everything after this stage runs `npm run test:contract` and needs it green.

**Hands forward:** clean gate, decisions on record.

### Stage 1 · Entry UX pass, Waves 1–3 (M)

Plan: `docs/2026-09-18-entry-ux-pass.md`, Tasks 1.1 → 3.3.

**Why first.** It fixes five live bugs, settles the vocabulary that every later plan's "new copy" list assumes, and puts the add-entry form and the concurrency strip where the later plans will add chrome. Doing it after them would mean redoing their Today/Reports edits.

**Needs:** Stage 0 gate. **Hands forward:** one vocabulary (entry / Overlap / On the clock); form at the top of Today; `src/lib/jobColors.ts`; `weeksWithEntries` service fn; the `"+ Overlap"` prefill state in `today.tsx` that later plans must not break.

**Watch:** Task 1.2 changes strings the sibling plans call frozen ("Add interval" → "Add entry", legend "premium" → "Overlap"); update their new-copy lists in the same commit (the assignments plan Task 4.1 is the one that mentions the picker).

### Stage 2 · Audit & reporting (L)

Plan: `docs/2026-09-17-audit-and-reporting.md`, Waves A → C, then D1. Reviewed and corrected 2026-09-18.

**Why here.** It is the largest plan and the only one whose migrations (0004–0006) are numbered explicitly; landing it first keeps that numbering true. It adds `jobs.budgetCents`, flag thresholds, interval events, trends, realization, team view, bulk approve and the audit CSV. It does not touch Today, so Stage 1's layout is safe.

**Needs:** Stage 1 vocabulary (its new copy says 'Entry created / edited / deleted', which matches). **Hands forward:** `loadIntervalsInRange` gains `jobIds` (Task B3); `ExportCsvInput.view` gains `'events'`; `WeekForApproval` gains `intervalEvents`; `org_settings` gains three flag columns; `/team` route.

**Watch:** Task C3 adds a route, so `npm run build` before `npm run check`. Task B2 must use the sibling `realization` map, not fields on `ClientRecon` (contract equality). Test files that touch `org_settings` reset it in `beforeEach`.

### Stage 3 · Assignments & allocation, Waves 1–4 (L)

Plan: `docs/2026-09-18-assignments-and-allocation.md`, Tasks 1.1 → 4.2. Wave 5 (enforcement) and Wave 6 (docs) are deferred to Stage 6.

**Why here.** Due dates and assignments are inputs to the client and project pages (Stage 4 reads `dueOn` and `assigned`). Its Task 3.2 reuses the `jobIds` filter Stage 2 added, and its Task 4.1 edits the job picker Stage 1 replaced with `JobPicker`, so both must precede it.

**Needs:** Stage 1 `JobPicker` (Task 4.1 adds the 'Assigned' group to it, not to a `<select>`); Stage 2 `jobIds` filter (skip that plan's own copy of the change). **Hands forward:** `projects.dueOn`, `jobs.dueOn`, `assignments` table, `src/lib/{dueDates,allocation}.ts`, `allocationReport`, `ExportCsvInput.view` gains `'allocations'`.

**Watch:** migration numbers are "next free" (0007, 0008 if Stage 2 landed 0004–0006). `structureTree.tsx` is edited by Stages 2, 3 and 4; rebase carefully.

### Stage 4 · Clients & projects pages (L)

Plan: `docs/2026-09-18-clients-and-projects-pages.md`, Waves 1 → 4.

**Why here.** It moves two admin pages, adds four routes, and its detail pages display budgets (Stage 2), due dates and assignments (Stage 3), and the vocabulary (Stage 1). Landing it last among the feature plans means every "if landed" branch in it is simply "landed".

**Needs:** Stages 1–3. **Hands forward:** `/clients`, `/projects` and detail routes; `client_contacts`; `src/lib/{search,overtime}.ts`; entity-scoped CSV filters; unarchive service functions.

**Watch:** Task 1.1 deletes `admin/clients.tsx` and `admin/projects.tsx`; the `_app/route.tsx` Admin link currently points at `/admin/clients` and must move to `/admin/jobs`. Four route additions → `npm run build` before `npm run check` in Task 1.1.

### Stage 5 · Entry UX pass, Waves 4–5 (M)

Plan: `docs/2026-09-18-entry-ux-pass.md`, Tasks 4.1 → 5.3.

**Why here.** Smart defaults, inferred midnight, the responsive floor and the DESIGN.md update describe the finished surface, which now includes Stage 3's 'Assigned' picker group and Stage 4's links on Today. Task 4.2 (job picker) was pulled forward into Stage 1 in spirit: if Stage 1 shipped `JobPicker`, Task 4.2 here is already done; tick it and move on.

**Needs:** Stages 1–4. **Hands forward:** `@media` floor; `DESIGN.md` current; `CLAUDE.md` rows for `entryDefaults`, `stripLayout`, `jobColors`, `jobPicker`.

### Stage 6 · Enforcement and wrap-up (S)

Plan: `docs/2026-09-18-assignments-and-allocation.md`, Waves 5–6.

**Why last.** `requireAssignment` is the only change in any plan that takes an ability away from users. It ships default-off after people can see their assignments on Today (Stage 3 Wave 4) and on the project pages (Stage 4).

**Needs:** Stage 3. **Hands forward:** `NOT_ASSIGNED` guard in `intervals.ts`; rule 3 guard order updated in `CLAUDE.md`.

## Shared files, who touches them

| File | Stages | Rule |
|---|---|---|
| `drizzle/schema.ts` + migrations | 2, 3, 4, 6 | one plan's migrations at a time; never renumber |
| `src/server/services/reports.ts` (`loadIntervalsInRange` filter) | 2 (`jobIds`), 3 (reuses), 4 (`projectId`) | additive filter keys only |
| `src/lib/schemas/reports.ts` (`ExportCsvInput.view`) | 2 (`events`), 3 (`allocations`), 4 (`clientId`/`projectId` filters) | extend the enum, never reorder |
| `src/components/structureTree.tsx` | 2 (budget), 3 (due chip, assign pills), 4 (links, `today` prop) | small diffs, one stage at a time |
| `src/routes/_app/reports.tsx` | 1 (operator period, vocabulary), 2 (trends, deltas, by-job), 3 (allocations sub-tab), 4 (links) | sub-tab enums extend in order |
| `src/routes/_app/today.tsx` | 1, 5 (layout), 3 Wave 4 (assignments strip), 4 (links) | Stage 1's `prefill` state and form-first order are fixed after Stage 1 |
| `src/components/entryForm.tsx` / `jobPicker.tsx` | 1 (compact, picker), 3 Wave 4 ('Assigned' group), 5 (defaults) | picker groups: Assigned › Recent › Client/Project |
| `src/routes/_app/route.tsx` (nav) | 2 (`/team`), 4 (`/clients`, `/projects`), 5 (media query) | final order: Today · Reports · Clients · Projects · Approvals · Team · Leave · Admin |
| `org_settings` | 2 (flag thresholds), 6 (`requireAssignment`) | tests reset the row in `beforeEach` |
| `CLAUDE.md` | every stage's wrap-up task | append rows; keep rule 7's code list complete |

## Gate for every stage

```
export PATH=~/.nvm/versions/node/v24.19.0/bin:$PATH
npm run check
npm run test:contract
npm run build          # confirms routeTree.gen.ts is committed and stable
```

Then: the plan's Done Criteria all hold, the wrap-up commit exists, and the plan document is deleted from `docs/` (convention). Tick the stage here.

## Progress

- [ ] Stage 0 · Housekeeping
- [ ] Stage 1 · Entry UX Waves 1–3
- [ ] Stage 2 · Audit & reporting
- [ ] Stage 3 · Assignments Waves 1–4
- [ ] Stage 4 · Clients & projects pages
- [ ] Stage 5 · Entry UX Waves 4–5
- [ ] Stage 6 · Enforcement + wrap-up

## Why this order, and what can slip

Bugs and vocabulary first because they are cheap and every later plan writes strings and Today/Reports code that would otherwise be redone. The audit plan next because it is the biggest, the most self-contained, and the one with hard-coded migration numbers. Assignments before the entity pages because the pages display what assignments produce. The rest of the UX pass after the features so it describes the finished surface. Enforcement last, default off.

If time is cut: Stages 0–2 are the core (fixes, vocabulary, audit trail). Stage 3 without Wave 4 still delivers planning data. Stage 4 can ship Wave 1 alone (pages out of Admin with search) and stop. Stage 5 can drop Task 5.2 (drag). Stage 6 can wait indefinitely.
