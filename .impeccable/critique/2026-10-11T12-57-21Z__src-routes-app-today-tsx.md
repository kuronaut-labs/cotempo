---
target: Today timesheet entry surface
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
target_identity: "file:/home/ronin/Projects/cotempo/src/routes/_app/today.tsx"
target_fingerprint: "sha256:af84490bf4b393726243c79125de2a3a5cca138c4f6dd9fbf35bd2b91619c343"
target_path: /home/ronin/Projects/cotempo/src/routes/_app/today.tsx
timestamp: 2026-10-11T12-57-21Z
slug: src-routes-app-today-tsx
closed: true
---
# Critique — `/today` (timesheet entry surface)

Method: dual-agent (A: design review sub-agent · B: detector + browser evidence sub-agent)
Mode: Operate. Live review (admin, 1440px + 390px, overlap-rich seeded day), source-verified vs docs/DESIGN.md + terminology doc. Detector: CLI 0 static findings on .tsx closure; browser overlay injected on 4 states. App console: hydration errors (nested button, SSR mismatch), 1 404.

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | No pending state on Add (double-fire), no success acknowledgment |
| 2 | Match System / Real World | 2 | "-443:00 left" + "0:00 allocated" side by side; Min column meaning only in a title |
| 3 | User Control and Freedom | 2 | Native window.confirm delete, no undo despite soft-delete model |
| 4 | Consistency and Standards | 3 | Picker shows same entity two ways; OS-locale time pickers |
| 5 | Error Prevention | 4 | Smart defaults, live duration, next-day wrap, humane overlap error copy |
| 6 | Recognition Rather Than Recall | 3 | Jobs picked as text, color only after landing; trio meaning behind "?" |
| 7 | Flexibility and Efficiency | 4 | Drag prefill, +Overladp, collapsed lanes — drag is pointer-only |
| 8 | Aesthetic and Minimalist Design | 3 | Card-in-card border on Add panel; clipped ticks; sliver columns |
| 9 | Error Recovery | 2 | Field errors can render inside collapsed More details |
| 10 | Help and Documentation | 2 | "?" how-counted popover renders broken at ~60px wide |
| Total | | 28/40 | Good — solid foundation, weak state-feedback areas |

## Design Specificity Verdict
Authored, strongly. Overlap is the product: triple encoding (hatch + xN chip + +Overlap) across strip, chip, table, legend, popover; vocabulary matches terminology doc verbatim. Dilution at the edges: Add-entry form panel, Assignments panel.

## What's Working
1. Overlap as designed story, not footnote (ministrip, dayMathChip, howCounted agree with terminology doc).
2. Two-keystroke create path: smart start chain (entryDefaults.ts:14-28), duration-first with live "= 1:00", pre-emptive "Ends next day".
3. Lane thinking: own lane never collapses, others fold to 48px ghost Add, triggers scroll form into view (today.tsx:218-246,95-98).

## Priority Issues
- [P0-1] Add entry form unusable on mobile: .entryform-main fixed grid 240/120/120/96 (global.css:820-822); <=720px query sets flex-wrap (no-op on grid, :2168-2174) so Add button sits at x 610-706, off a 500px viewport. Fix: real mobile rule (flex-column or 1fr + full-width actions); also .collapsed-head wrap. Cmd: /impeccable adapt.
- [P0-2] Whole page scrolls horizontally on phones (756 scrollWidth @ 500px), driven by P0-1 + 130px fixed date input in DateNav. Fix: overflow-x clip on main.today, wrap DateNav. Cmd: /impeccable adapt.
- [P1-3] "?" how-counted popover renders ~60px-wide sliver (global.css:1447-1458: absolute + max-width, no width). Fix: width: min(360px, calc(100vw - 32px)). Cmd: /impeccable polish.
- [P1-4] Strip tick labels + legend clip at both ends (global.css:660-698, overflow:hidden, top:100% labels). Fix: inset-anchor first/last ticks, un-hide label layer. Cmd: /impeccable layout.
- [P1-5] Overlap hatch paints over lower-row job labels (global.css:709-715). Fix: per-row clipped hatch or lift labels with scrim. Cmd: /impeccable polish.
- [P2-1] No success moment after Add + double-fireable submit (entryForm.tsx:275-286). Fix: disabled/Saving…, flash new row via hoverId, scrollIntoView mobile. Cmd: /impeccable delight or harden.
- [P2-2] Delete is native window.confirm, row destructive affordance styled neutral ghost (today.tsx:126). Fix: inline confirm / styled modal + brief undo (soft delete exists, rule 9). Cmd: /impeccable harden.
- [P2-3] Assignments panel reads as nonsense: "-443:00 left", "—" pace chips, mono strings clip mid-token (assignmentsStrip.tsx:50-54, global.css:422-436). Fix: human phrasing for negatives, wrap-safe rows. Cmd: /impeccable clarify.

## Persona Red Flags
- Alex (power user): double-fire Add; drag-to-prefill pointer-only + role="img" hides strip from AT (ministrip.tsx:170); admin others' lanes show empty actions column that reads as broken.
- Casey (mobile): Add off-viewport, half the form invisible, Assignments mid-token clipping, collapsed-lane ghost Add at x≈675 @ 500px, native confirm mid-flow.
- Sam (a11y): div[data-tip] chips not focusable despite keyboard tooltip claim; role="img" hides per-entry data; aria-activedescendant missing in jobPicker nav (jobPicker.tsx:79-93).

## Minor Observations
- No h1; worker names / lane heads / Add entry all identical 20px/600.
- Min column meaning behind native title (violates data-tip convention), intervalList.tsx:81.
- Card-in-card double border around Add entry (today.tsx:161).
- Detector true positive: .dm.zero --color-faint #a4a097 on white = 2.6:1 (dayMathChip.tsx:16).
- FPs: overused-font (Inter is explicit token), summary.iconbtn overflow.

## Questions to Consider
- Should the trio only appear when the three numbers diverge?
- Who is the compact form's Worker select for — force other-person entries through lane Add?
- Is drag-to-log an input gesture or a read-mostly surface pretending to be input?
