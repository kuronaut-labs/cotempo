# Entry UX Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make adding time the first thing on Today and make concurrent work the thing you see. Fix the bugs the UX review found, settle terminology, shorten the entry form, turn the day strip into a readable timeline with stacked overlapping entries, add a one-click "log another job over this window" gesture, and give the layout a phone-width floor.

**Source:** `docs/reports/2026-09-18-ux-deep-dive.md` (findings numbered there; each task cites them).

**Architecture:** Five waves, all in `src/routes` and `src/components` plus CSS. No schema, no service signature changes, one small additive service function. Pure layout maths live in exported helpers with unit tests (the existing `stripBlocks` pattern); components stay untested beyond `npm run check`. Waves 1 and 2 ship the quick wins; Wave 3 is the concurrency redesign; Wave 4 is form intelligence; Wave 5 is the responsive floor and docs.

**Tech Stack:** TanStack Start/Router, React 19, `@tanstack/react-form`, existing design tokens (`src/styles/tokens.css`), `reicon-react`, vitest unit project for pure helpers.

## Global Constraints

- Node 24 via **nvm** (`.nvmrc`); the shell default is Node 21, so `export PATH=~/.nvm/versions/node/v24.19.0/bin:$PATH` before any npm/npx. Gate: `npm run check` exit 0. `npm run test:contract` stays green (no contract file asserts UI copy or component output; `tests/contract/unit` covers attribution, daymath, redflags only).
- No new dependencies. No new routes (`src/routeTree.gen.ts` must not churn).
- **Design system:** `docs/DESIGN.md` is the spec. Tokens only, no raw hex, no third accent, tables and strips stay square, transitions ≤ 200ms, `data-tip` for tooltips on enabled elements, icons from `reicon-react` at 13/14/15.
- **Copy:** this plan CHANGES existing user-visible strings deliberately (Task 1.2). Every other plan's "copy freeze" refers to the vocabulary Task 1.2 lands, so land Task 1.2 first and update the sibling plans' new-copy lists if they conflict ("Add interval" → "Add entry", etc.).
- **Money (#5):** untouched. Nothing here reads `cents`.
- **Time (#19/#22/#23):** the browser builds instants only in `entryForm.tsx`'s `combine()` via `TZDate`; every new default or duration computation stays in `HH:MM` strings and minutes until that call. No `Date` local-time methods.
- **#13 (retro form only):** no live timers. Drag-to-prefill on the strip (Task 5.2) only fills the form; it does not create an entry.
- **Fixed signatures (rule 10):** `stripBlocks(day, intervals)` and its return shape stay byte-identical (existing unit tests use `toEqual` on it); new layout data comes from new functions.
- Existing tests that assert removed strings or props (`tests/unit/miniStrip.test.ts`, `tests/unit/button.test.ts`, etc.) are updated in the same task that changes the behaviour, never deleted.
- Dev server: `npm run dev -- --port 3123 --strictPort`; seeded logins `ops@example.com` / `billing@example.com` with `demo-password-123`. Seeded data sits in the week the seed was last run (check `select max(started_at) from intervals`), not necessarily this week.
- **Sequencing against the other plans:** land Waves 1–3 of this plan before `docs/2026-09-18-assignments-and-allocation.md` Wave 4 (it edits the job picker) and before `docs/2026-09-18-clients-and-projects-pages.md` Task 4.1 (links on Today). The audit plan does not touch Today.

## Locked Decisions

1. **Vocabulary:** the unit of logged time is an **entry** (code keeps `interval`). The third trio value is **Overlap** everywhere; **premium** disappears from UI text and legends. Wall-clock is **On the clock**. Billable stays **Billable**. Effort is **Total of entries**.
2. **Today order:** date nav → Add entry (compact) → the viewer's own lane → other lanes (collapsed when empty) → nothing else. The explainer becomes a `?` popover next to the trio.
3. **Overlap leads when non-zero.** The trio order stays On the clock · Total of entries · Overlap, but a non-zero Overlap chip takes the emphasised style (larger value, warm border, `--premium-text` value). Zero overlap renders muted. Open question flagged in the review (does leading with overlap make operators cautious); revisit after real use, the CSS swap is one class.
4. **Strip window:** 06:00–22:00 local by default; expands to include any entry outside it, to the hour. Hour ticks every 2h with labels at 06/09/12/15/18/21 when width allows.
5. **Overlapping entries stack.** Greedy row assignment by start time (first row whose last block ends ≤ this block's start). Overlap hatch spans the full strip height over the overlap column, with the `×N` tag above the track, never clipped.
6. **"+ Overlap" row action** opens the entry form pre-filled with the row's worker, start and end, job empty, focus on the job picker. The form heading reads "Add entry over 17:00–20:00".
7. **Compact form:** one row (Job · Start · Duration · Add) plus a "More" disclosure for Worker, End, Note. Duration and End are bound; editing either updates the other. Date field removed (the nav owns it). Worker hidden when the selectable list is one person.
8. **Smart start default:** the end of the latest entry for the selected worker on the shown date; else, when the shown date is today, the current time rounded down to 5 minutes (server `today` plus `Date.now()` minutes only via `localHHMM`); else 09:00. Duration defaults to 1:00.
9. **Crosses midnight is inferred:** end earlier than start means next day; the form shows an inline note "Ends next day" instead of a checkbox.
10. **Empty lanes collapse** to a one-line row ("Atlas · nothing logged · Add"); the viewer's own lane never collapses.
11. **Approvals › My weeks lists newest first.** Hours on the card are a follow-up (needs a service addition beyond this plan's scope).

## Findings → Task Map

| Review finding | Task |
|---|---|
| 4 (bugs) | 1.1 |
| 6 (terminology) | 1.2 |
| 1 (form last, empty lanes, explainer) | 2.1, 2.2 |
| 2 (strip scale, tag clip, no axis, hidden blocks, row link, colours, no gesture, chip weight) | 1.1 (tag, colours), 3.1, 3.2, 3.3 |
| 3 (form friction) | 2.1 (layout), 4.1, 4.2 |
| 5 (approvals order) | 1.1 |
| 4 (no `@media`) | 5.1 |
| 7 (money twice, unpaid leave) | 5.3 |

## File Structure

| File | Responsibility |
|---|---|
| `src/routes/_app/today.tsx` | page order, lane collapse, overlap-prefill state |
| `src/routes/_app/approvals.tsx`, `src/components/weekStatus.tsx` | bug fixes, week order |
| `src/routes/_app/reports.tsx`, `src/components/operatorLanes.tsx` | period selector for operators, global job colours, lane alignment |
| `src/components/entryForm.tsx` | compact layout, duration, smart defaults, inferred midnight, single job picker |
| `src/lib/entryDefaults.ts` (new) | pure: `defaultStart`, `durationBetween`, `endFromDuration`, `crossesMidnight` |
| `src/components/miniStrip.tsx` | window, ticks, rows, tag placement; `stripBlocks` unchanged |
| `src/lib/stripLayout.ts` (new) | pure: `stripWindow`, `assignRows`, `hourTicks` |
| `src/components/jobPicker.tsx` (new) | searchable grouped select with Recent |
| `src/components/trioChip.tsx`, `src/components/dayMathChip.tsx`, `src/components/reconBars.tsx`, `src/components/intervalList.tsx` | vocabulary, emphasis, swatches, "+ Overlap" |
| `src/components/howCounted.tsx` (new) | popover content, replaces the card |
| `src/styles/global.css`, `src/styles/ui.css` | strip, compact form, collapsed lanes, media queries |
| `docs/DESIGN.md`, `docs/reports/2026-09-18-ux-terminology.md` (new) | vocabulary record |
| `tests/unit/{entryDefaults,stripLayout}.test.ts` (new), `tests/unit/miniStrip.test.ts` | pure helper tests |

---

## Wave 1 · Bugs and words

### Task 1.1: fix what the review found

**Files:**
- Modify: `src/routes/_app/approvals.tsx`, `src/components/weekStatus.tsx`, `src/routes/_app/reports.tsx`, `src/components/operatorLanes.tsx`, `src/components/miniStrip.tsx`, `src/styles/global.css`

- [ ] **Step 1: nested buttons (finding 4, row 1).** In the operator branch of `approvals.tsx`, the queue `<li>` wraps a `<button>` that contains `WeekStatus`, which renders its own Submit `<button>`. Change the outer element to a `<div role="button" tabIndex={0}>` with `onClick` and `onKeyDown` (Enter/Space) calling `goSearch`, and stop propagation on the inner Submit button's click. Keep the `.approvalsqueue li button` styles by adding the class `queue-row` and duplicating the selector as `.approvalsqueue li .queue-row`.
- [ ] **Step 2: Submit on empty weeks (row 2).** `WeekStatusChip` passes `hasIntervals` as a literal `true`. `MyWeek` carries no minutes and its type is fixed, so compute it in the loader: for the operator branch, call `listDayFn`? No — that is per day. Instead add one additive service function `weeksWithEntries(deps, ctx, { workerId, weekStarts }): Promise<string[]>` in `src/server/services/approvals.ts` (new export, not a signature change) that returns the week keys with at least one live interval intersecting the week, and a matching `weeksWithEntriesFn`. Pass `hasIntervals={withEntries.includes(w.weekStart)}`. Integration test: seeded operator has entries in the seeded week only.
- [ ] **Step 3: operator period selector (row 3).** `reports.tsx` `OperatorPanel` gets the same `PeriodSelector` the billing panel uses, wired to `onPeriodChange`. Pass `today`, `tz`, `from`, `to` through.
- [ ] **Step 4: lane alignment (row 4).** In `operatorLanes.tsx` the header (`.lanehead`) and body (`.lanebody`) are siblings inside `.lane`, but the CSS lays `.operatorlanes` out as a two-column grid across lanes, so headers and bodies interleave. Make each `.lane` its own grid (`grid-template-columns: 180px 1fr`) and `.operatorlanes` a single column. Verify in the browser that "Demo Operator" sits beside its own rows.
- [ ] **Step 5: global job colours (row 6 / finding 2).** `OperatorLanes` takes a `jobColorIndex` prop built once by the caller (reuse `colorIndexFromStructure` from `today.tsx`; move it to `src/lib/jobColors.ts` and import in both). Remove the per-lane `jobColorMap`.
- [ ] **Step 6: clipped tag (row 5).** Render `.ministrip-overlap-tag` outside `.ministrip-track` in a sibling `.ministrip-tags` row above the track (`position: relative; height: 14px`), positioned by the same `leftPct`. `.ministrip` no longer needs `overflow: hidden` on the outer element; keep it on the track.
- [ ] **Step 7: newest week first (finding 5).** In the operator branch, `data.weeks` renders reversed (`[...data.weeks].reverse()`); do not change `listMyWeeks`.
- [ ] **Step 8:** `npm run check` → exit 0. Browser check the three pages.

```bash
git add src/routes/_app/approvals.tsx src/components/weekStatus.tsx src/routes/_app/reports.tsx src/components/operatorLanes.tsx src/components/miniStrip.tsx src/lib/jobColors.ts src/routes/_app/today.tsx src/server/services/approvals.ts src/server/fns/approvals.ts src/styles/global.css tests/integration/approvals.service.test.ts
git commit -m "fix: approvals queue markup, empty-week submit, operator period, lane alignment, strip tag"
```

### Task 1.2: one vocabulary

**Files:**
- Create: `docs/reports/2026-09-18-ux-terminology.md`
- Modify: `docs/DESIGN.md` (principle 7 citation), `src/routes/_app/today.tsx`, `src/components/{intervalList,trioChip,dayMathChip,reconBars,approverView,operatorLanes}.tsx`, `src/routes/_app/reports.tsx`, `src/components/forms/applyServerError.ts`

- [ ] **Step 1:** Write the terminology file: the table below plus the rationale (Locked Decision 1). `DESIGN.md` principle 7 cites it.

| Old | New |
|---|---|
| Add interval / Edit interval | Add entry / Edit entry |
| Delete this interval? | Delete this entry? |
| No entries logged for this day. | unchanged |
| Entries (N) (approver view) | unchanged |
| wall-clock (bar legend) | On the clock |
| premium (bar legend, "+1:00 premium") | Overlap ("+1:00 overlap") |
| $ billable (trio segment) | unchanged |
| Interval {id} … (red-flag details) | unchanged (contract-locked strings in `src/lib/redFlags.ts`) |
| "This overlaps another entry on the same job…" | unchanged |

- [ ] **Step 2:** Sweep the files listed. `grep -rn "interval" src/routes src/components --include='*.tsx' -i` and change only user-visible strings; identifiers stay.
- [ ] **Step 3:** Update the sibling plans' "new copy" lists where they say "Add interval" or "premium" (assignments plan Task 4.1, clients plan Task 3.3 'Overtime' is fine).
- [ ] **Step 4:** `npm run check` → exit 0.

```bash
git add docs/reports/2026-09-18-ux-terminology.md docs/DESIGN.md src/routes/_app/today.tsx src/components src/routes/_app/reports.tsx docs/2026-09-18-assignments-and-allocation.md
git commit -m "chore: one vocabulary — entry, overlap, on the clock"
```

---

## Wave 2 · Add entry first

### Task 2.1: compact form at the top

**Files:**
- Modify: `src/routes/_app/today.tsx`, `src/components/entryForm.tsx`, `src/styles/global.css`

**Interfaces:**
- `EntryForm` gains `compact?: boolean` (default `false` so `approverView`/other callers are untouched) and `heading?: string`. In compact mode: row 1 = Job · Start · Duration · Add; a "More" disclosure (`<details>`, summary text 'More') reveals Worker, End, Note. Non-compact mode keeps the current full layout for edit.

- [ ] **Step 1:** Move the `Add entry` panel above `.today-lanes` in `today.tsx`. Render it compact when `editing === null`, full when editing (edit keeps the current form; it is opened from a row and scrolls into view).
- [ ] **Step 2:** Add a Duration field (`HH:MM` or `H.HH` text, `inputMode="numeric"`) bound to End through `src/lib/entryDefaults.ts` (`durationBetween(startHHMM, endHHMM, crossesMidnight)`, `endFromDuration(startHHMM, durationMin)`, returning `{ end, crossesMidnight }`). Unit tests: 17:00 + 3:00 → 20:00; 22:00 + 4:00 → 02:00 next day; 09:00→10:30 = 1:30. Pure string/minute maths, no `Date`.
- [ ] **Step 3:** Remove the disabled Date field. Hide the Worker field when `workerGroups` yields a single option (still submitted as `selfWorkerId`).
- [ ] **Step 4:** CSS `.entryform.compact` grid `minmax(240px,2fr) 120px 120px auto`, inputs 40px in compact mode, `details summary` styled as a ghost button.
- [ ] **Step 5:** `npm run check`; browser check at 1280 and 390.

```bash
git add src/routes/_app/today.tsx src/components/entryForm.tsx src/lib/entryDefaults.ts tests/unit/entryDefaults.test.ts src/styles/global.css
git commit -m "feat: compact add-entry form at the top of today"
```

### Task 2.2: lanes that earn their space

**Files:**
- Modify: `src/routes/_app/today.tsx`, `src/components/howCounted.tsx` (new), `src/styles/global.css`

- [ ] **Step 1: collapsed empty lanes.** A lane with zero intervals and `workerId !== ctx.workerId` renders `.today-lane.collapsed`: one row with name, 'nothing logged', and an 'Add' ghost button that opens the compact form with Worker preset (only when `canEditRow`). Clicking the name expands to the full lane.
- [ ] **Step 2: explainer to popover.** Move the card body into `HowCounted` rendered as a `<details className="howcounted">` whose summary is a `?` icon button (`aria-label="How time is counted"`) placed after the trio in the viewer's own lane head. Remove the `showHowCounted` localStorage logic and the card. Copy unchanged inside.
- [ ] **Step 3:** CSS: `.today-lane.collapsed` 48px row with hover fill; `.howcounted[open] > .howcounted-body` positioned absolute, radius-lg, shadow-2, max-width 360px.
- [ ] **Step 4:** `npm run check`; browser check with billing (five lanes → own lane full, others collapsed unless they have entries).

```bash
git add src/routes/_app/today.tsx src/components/howCounted.tsx src/styles/global.css
git commit -m "feat: collapsed empty lanes and how-counted popover"
```

---

## Wave 3 · Concurrency you can see

### Task 3.1: strip window, ticks, rows

**Files:**
- Create: `src/lib/stripLayout.ts`, `tests/unit/stripLayout.test.ts`
- Modify: `src/components/miniStrip.tsx`, `src/styles/global.css`, `tests/unit/miniStrip.test.ts` (only if a test asserts DOM/CSS it should not)

**Interfaces (pure):**

```ts
export function stripWindow(day: Range, intervals: { startMs: number; endMs: number }[], tz: string, defaultStartHour = 6, defaultEndHour = 22): Range
// clamps to the day; expands to whole hours to include any interval; returns the day when empty
export function assignRows(blocks: { id: string; clippedStart: number; clippedEnd: number }[]): Map<string, number>
// greedy by clippedStart: first row whose last end <= start; row indices 0..n
export function hourTicks(window: Range, tz: string, everyHours = 2): { ms: number; leftPct: number; label: string | null }[]
```

- [ ] **Step 1:** Unit tests: window defaults to 06–22 for a 09–17 day; expands to 05–22 for a 05:30 start; expands to 24h for a 23:00–02:00 crossing; `assignRows` puts A 17–20 in row 0, B 18–19 in row 1, C 20–21 back in row 0; ticks land at 06/08/…/22 with labels every 3h.
- [ ] **Step 2:** `MiniStrip` computes `window = stripWindow(day, intervals, tz)` and passes `window` (not `day`) to `stripBlocks`. Blocks get `top`/`height` from `assignRows` (row height 22px, gap 2px; strip height = rows × 24 + 8, min 56px). Overlap regions become full-height `.ministrip-overlap` columns behind the blocks; the `×N` tag sits in `.ministrip-tags`. Ticks render as `.ministrip-tick` hairlines with mono 10px labels below.
- [ ] **Step 3:** Block labels: when `widthPct` ≥ 8, show the job name (from a new optional `jobNames?: Record<string, string>` prop); else nothing, `data-tip` carries `job · start–end`.
- [ ] **Step 4:** CSS: track `--fill-hover` background, `.ministrip-block` radius 0 (square per DESIGN), hatch `repeating-linear-gradient(45deg, var(--premium-fill) 0 4px, transparent 4px 8px)` at 35% opacity across the column.
- [ ] **Step 5:** `npm run check`. `stripBlocks` tests unchanged and green.

```bash
git add src/lib/stripLayout.ts tests/unit/stripLayout.test.ts src/components/miniStrip.tsx src/styles/global.css
git commit -m "feat: working-window day strip with stacked overlapping entries"
```

### Task 3.2: link rows to blocks, promote overlap

**Files:**
- Modify: `src/components/intervalList.tsx`, `src/components/dayMathChip.tsx`, `src/components/trioChip.tsx`, `src/routes/_app/today.tsx`, `src/styles/global.css`

- [ ] **Step 1: swatches.** `IntervalList` gains `jobColorIndex` and renders a `.swatch.job-cN` before the job name. Row hover sets a shared `hoverId` in `today.tsx` state; `MiniStrip` gains `highlightId?: string` and adds `.is-hover` to that block (outline 2px `--color-primary`). Block hover does the reverse via an `onHover` callback.
- [ ] **Step 2: overlap emphasis.** `DayMathChip`: when `premiumMin > 0`, `.dm.premium` gets `font-size: 14px; border-width: 2px` and the value in `--premium-text` (already); when zero, `.dm.zero` uses `--color-faint` text. Same rule for `TrioChip .seg.p`. Order unchanged (Locked Decision 3).
- [ ] **Step 3:** `npm run check`; browser check hover linkage.

```bash
git add src/components/intervalList.tsx src/components/dayMathChip.tsx src/components/trioChip.tsx src/routes/_app/today.tsx src/styles/global.css
git commit -m "feat: row-to-block linking and overlap emphasis"
```

### Task 3.3: "+ Overlap" gesture

**Files:**
- Modify: `src/components/intervalList.tsx`, `src/routes/_app/today.tsx`, `src/components/entryForm.tsx`

- [ ] **Step 1:** `IntervalList` gains `onOverlap?: (id: string) => void`; each editable row shows a ghost `+ Overlap` button (icon `Layers` from `reicon-react` if exported, else `Plus`) before Edit.
- [ ] **Step 2:** `today.tsx`: `const [prefill, setPrefill] = useState<Initial | null>(null)`. `onOverlap` sets `prefill = { workerId, startedAt, endedAt }` (no `id`, no `jobId`), scrolls the form into view and focuses the job picker (`autoFocusJob` prop). The form heading becomes `Add entry over ${localHHMM(start)}–${localHHMM(end)}`. Submitting or cancelling clears `prefill`. `key` the form on `prefill` so defaults reset.
- [ ] **Step 3:** The compact form in this state shows Start and Duration filled and Worker preset; `More` stays closed.
- [ ] **Step 4:** New copy: '+ Overlap', 'Add entry over {start}–{end}'. `npm run check`; browser check: click + Overlap on Pipeline Maintenance 17:00–20:00, pick Eval Harness Runs, Add → the strip shows two rows and the Overlap chip lights.

```bash
git add src/components/intervalList.tsx src/routes/_app/today.tsx src/components/entryForm.tsx
git commit -m "feat: add an overlapping entry from a row"
```

---

## Wave 4 · A form that guesses well

### Task 4.1: smart defaults and inferred midnight

**Files:**
- Modify: `src/lib/entryDefaults.ts`, `tests/unit/entryDefaults.test.ts`, `src/components/entryForm.tsx`, `src/routes/_app/today.tsx`

- [ ] **Step 1:** `defaultStart({ lastEndHHMM, isToday, nowHHMM }): string` per Locked Decision 8. Unit tests for the three branches and the 5-minute rounding.
- [ ] **Step 2:** `today.tsx` computes `lastEndByWorker` from `day.intervals` (max `endedAt`, clipped to the day, as `localHHMM`) and passes `lastEndHHMM` for the selected worker; `nowHHMM` comes from `localHHMM(Date.now(), tz)` only when `date === today` (a minute-granular read; #23's "never `new Date()` for today's date" is about the date, which still comes from the server).
- [ ] **Step 3:** Remove the "Crosses midnight" checkbox. `crossesMidnight` is derived by `entryDefaults.crossesMidnight(start, end)` (end ≤ start); the form shows `<span className="status-msg">Ends next day</span>` under End when true. Edit mode: an existing interval whose local end date differs still derives true from its times.
- [ ] **Step 4:** `npm run check`.

```bash
git add src/lib/entryDefaults.ts tests/unit/entryDefaults.test.ts src/components/entryForm.tsx src/routes/_app/today.tsx
git commit -m "feat: smart start default and inferred next-day end"
```

### Task 4.2: one job picker

**Files:**
- Create: `src/components/jobPicker.tsx`
- Modify: `src/components/entryForm.tsx`, `src/styles/global.css`

**Interfaces:**
- `JobPicker({ structure, recentJobs, value, onChange, autoFocus })` — a text input with a listbox (`role="combobox"` + `role="listbox"`, arrow keys, Enter, Escape). Options grouped: 'Recent' first, then Client › Project headers with jobs beneath. Filter matches job, project or client name, case-insensitive. Selected value displays as `Client / Project / Job`. Archived entities excluded (same filters as today).
- When the assignments plan lands, its 'Assigned' group slots in above 'Recent' here instead of in a `<select>`.

- [ ] **Step 1:** Implement with `useState` only; no portal. Listbox absolute under the input, max-height 320px, scroll, radius-md, shadow-2.
- [ ] **Step 2:** `entryForm.tsx`: replace the Client `<select>` and Job `<select>` with `JobPicker` bound to `jobId`. Remove `selectedClient` state and `findClientForJob`.
- [ ] **Step 3:** Keyboard check in the browser: Tab to picker, type "eval", Enter, Tab to Start.
- [ ] **Step 4:** `npm run check`.

```bash
git add src/components/jobPicker.tsx src/components/entryForm.tsx src/styles/global.css
git commit -m "feat: searchable job picker replaces the client/job selects"
```

---

## Wave 5 · Floor and finish

### Task 5.1: responsive floor

**Files:**
- Modify: `src/styles/global.css`, `src/styles/ui.css`, `src/routes/_app/route.tsx`

- [ ] **Step 1:** `@media (max-width: 720px)`: `.app-nav` hides `.nav-user` and shows it inside a `details` menu with Sign out; nav links drop labels to icons with `aria-label` (keep 15px icons, 44px targets). `.daymath` chips one row of three compact values (`.dm .k` hidden, `data-tip` carries the label). `.approvals-split` and `.reports` two-column layouts stack. `.entryform.compact` wraps to two rows. `.intervallist` hides the Client column (`.intervallist .col-client`) and shows client in the job cell as a second line.
- [ ] **Step 2:** `@media (max-width: 480px)`: strip labels off, ticks every 3h.
- [ ] **Step 3:** `npm run check`; browser at 390 and 720.

```bash
git add src/styles/global.css src/styles/ui.css src/routes/_app/route.tsx src/components/intervalList.tsx
git commit -m "feat: phone-width layout floor"
```

### Task 5.2: drag on the strip to pre-fill (optional)

**Files:**
- Modify: `src/components/miniStrip.tsx`, `src/routes/_app/today.tsx`

- [ ] **Step 1:** `MiniStrip` gains `onRangeSelect?: (range: Range) => void`. Pointer down on the track, move, up → snap both ends to 5 minutes, call back. A faint selection rectangle draws during the drag. Touch uses the same pointer events. Keyboard: not in v1 (the form is the accessible path).
- [ ] **Step 2:** `today.tsx` sets `prefill` from the range (worker = the lane's worker if editable, else ignored). Same flow as "+ Overlap".
- [ ] **Step 3:** `npm run check`; browser check. Compatible with #13 (fills the form; the form creates).

```bash
git add src/components/miniStrip.tsx src/routes/_app/today.tsx
git commit -m "feat: drag a range on the strip to pre-fill an entry"
```

### Task 5.3: small things and docs

- [ ] **Step 1:** `reconTable.tsx`: drop the trailing `$` column; the trio's `$ billable` segment already carries it (finding 7). Keep the tfoot total money in the trio too.
- [ ] **Step 2:** Leave balances: for types with `paid: false`, render 'No balance' instead of '0:00 available' (new copy).
- [ ] **Step 3:** `docs/DESIGN.md`: Components gains "Job picker", "Day strip" (window, rows, ticks, tag), "Collapsed lane", "How-counted popover"; Data display conventions updates the mini-strip line (28px → rows × 24px, square blocks, hatch across the column); Icons placement map adds Layers/Plus (+ Overlap) and the `?` popover. Principle 7 cites the terminology file from Task 1.2.
- [ ] **Step 4:** `CLAUDE.md` "Where things are": `Entry defaults / strip layout | src/lib/{entryDefaults,stripLayout,jobColors}.ts`; `Job picker | src/components/jobPicker.tsx`.
- [ ] **Step 5:** `npm run check && npm run test:contract && npm run build`; `git status` shows no `routeTree.gen.ts` change.

```bash
git add src/components/reconTable.tsx src/routes/_app/leave.tsx docs/DESIGN.md CLAUDE.md
git commit -m "chore: entry ux pass wrap-up"
```

---

## Done Criteria

- Today opens with the compact Add entry row directly under the date nav; the viewer's lane follows; empty lanes of others are one-line rows; the explainer is a `?` popover.
- The strip shows a 06–22 window (auto-expanding), hour ticks, overlapping entries in separate rows, a full-height hatch over the overlap column, and an unclipped `×N` tag. Rows carry job swatches and hover-link to blocks.
- Non-zero Overlap is the emphasised chip; zero is muted.
- "+ Overlap" on a row opens the form pre-filled with that window and focus on the job picker; the heading names the window.
- The form has no Date field, hides Worker when there is one option, has Start + Duration bound to End, defaults start sensibly, infers next-day ends, and uses one searchable job picker.
- The approvals queue has valid markup, Submit is disabled on empty weeks, weeks list newest first; operators can change the Reports period; lanes align; job colours are consistent across Today and Reports.
- One vocabulary (entry / Overlap / On the clock) across the UI, recorded in `docs/reports/2026-09-18-ux-terminology.md` and cited from `DESIGN.md`.
- Phone-width layout works without horizontal scroll at 390px.
- No new dependencies, no contract edits, `routeTree.gen.ts` unchanged, gates green.

## Sequencing

**Why this order.** Bugs and vocabulary first because they are cheap, they make every later screenshot trustworthy, and the vocabulary decision changes strings that three other plans list as frozen copy. Moving the form to the top comes before redesigning the strip because it is the larger behavioural win for the smaller change, and because the "+ Overlap" gesture in Wave 3 needs the form to be where a click can land. The strip redesign follows with its layout maths unit-tested in isolation. Form intelligence is last among the functional waves because each default depends on data the earlier waves already put in the right place (last end per worker, one picker). The responsive floor and docs describe the result and so come last.

**What can slip.** Wave 1 and Wave 2 are the minimum: they fix the bugs and put the primary action first. Wave 3 is the point of the product and should not slip, but Task 3.3 alone (the gesture) carries most of its value if Task 3.1 has to be cut to "taller strip, tag unclipped". Wave 4 can ship one task at a time; Task 4.2 (job picker) is the one the assignments plan waits on. Task 5.2 (drag) is optional and marked so. Task 5.3 is small.
