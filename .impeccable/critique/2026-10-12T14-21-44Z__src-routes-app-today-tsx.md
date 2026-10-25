---
target: Today timesheet entry surface
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/ronin/Projects/cotempo/src/routes/_app/today.tsx"
target_fingerprint: "sha256:35e12ee1193220cfdc8df9c1085f803ec432253094b53d6dbc5a10399893b42c"
target_path: /home/ronin/Projects/cotempo/src/routes/_app/today.tsx
timestamp: 2026-10-12T14-21-44Z
slug: src-routes-app-today-tsx
---
# Critique re-run — `/today`

Method: dual-agent (A: design review · B: detector + browser evidence)
Mode: Operate. Desktop 1440 + mobile 390/500, overlap day 2026-09-07. CLI detector clean; browser overlay on 6 states.

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Compact Add no pending state / double-submit guard |
| 2 | Match System / Real World | 4 | Vocabulary compliant; "Over by" honest |
| 3 | User Control and Freedom | 3 | No undo; armed delete disarms only on blur |
| 4 | Consistency and Standards | 3 | Legend concatenates; date input clips year at 390 |
| 5 | Error Prevention | 3 | Smart defaults; double-submit comment violated on create path |
| 6 | Recognition Rather Than Recall | 3 | Tick labels vanish ≤480px |
| 7 | Flexibility and Efficiency | 3 | Drag-create undiscoverable |
| 8 | Aesthetic and Minimalist Design | 4 | Overlay-rich day with nothing that isn't data |
| 9 | Error Recovery | 4 | Field-mapped server errors; delete errors surfaced |
| 10 | Help and Documentation | 2 | `?` popover off-viewport left at 390 |
| Total | | 31/40 | Good |

## Design Specificity Verdict
HIGH PASS. Token contract obeyed as measured; vocabulary verbatim; legend conditional. Survived 390px overlap-saturated testing.

## Regression check (previous 28/40 run)
Fixed & verified: mobile Add restack (global.css:2227-2243), page horizontal scroll (overflow-x clip :904-909), tick layer (miniStrip.tsx:215-231), hatch z-index (global.css:690-696), inline two-step delete (intervalList.tsx:99-122), "Over by" phrasing (assignmentsStrip.tsx:59-60), nav self-pan (:2188-2197). Half-fixed: how-counted popover (width floor yes, anchor no), pending state (edit layout only).

## Priority Issues
- [P1] How-counted popover hangs off-viewport left at 390: right:0 anchor with `?` ~260px from left → body left:-97.8 under overflow-x clip (global.css:1470-1521). Fix: ≤720px fixed full-bleed sheet or left:8/right:8/width:auto. Cmd: /impeccable polish.
- [P2-a] Compact Add no pending/double-submit guard: submitButton (entryForm.tsx:353-359) never disabled; submitting-aware block only in edit layout (:282-293); invariant comment :124-126 violated. Fix: bind disabled={submitting} or use actions in compact mode. Cmd: /impeccable harden.
- [P2-b] Nested-button hydration error: collapsed lane head <button class=today-lane-head> (today.tsx:231) contains <Button> (today.tsx:239); React client-regenerates tree on collapsed-lane states; reproducible every empty/near-empty state. Fix: non-button head contains real buttons. Cmd: /impeccable harden.
- [P2-c] Panning interval table is an undetectable drawer on mobile: header truncates "TE", Note/actions hidden, armed Delete 84x32 below 44px floor. Fix: coarse-pointer 44px floors (::after inset pattern global.css:1491-1497) + right-edge fade on .intervallist-wrap (:766-773). Cmd: /impeccable adapt.
- [P3] Legend spans concatenate (miniStrip.tsx:236-241) → flex row with gap; date input min-width:0 clips year (global.css:2244-2251) → min-width ~9.5ch. Cmd: /impeccable polish.

## Personas
- Alex: no repeat shortcut; no undo; drag undiscoverable.
- Casey: broken popover (P1); drawer table (P2-c); clipped year; unlabeled ruler ≤480.
- Sam: role="img" strip swallows AT text; jobPicker no aria-activedescendant/option ids (jobPicker.tsx:99-131); pulse not aria-live; no Escape on armed delete; hover-only tooltips on unfocusable spans (intervalList.tsx:85).

## Detector evidence
CLI 0 on .tsx closure. Rendered: overlap day 46 findings = 9-10px ministrip/label text (34), stone 2.6:1 (real), iconbtn overflow (FP), nested-cards/hatch (FP), Inter advisory (FP). Hydration errors persist, source-located today.tsx:231-253.

## Minor
- Daymath trio +9px overflow at 390.
- Empty self-lane double empty-state (~140px @ 390).
- "End (Australia/Perth)" label → data-tip.
- Stale dev-DB duplicate row inflates overlap counts (fixture noise, demo.ts:193-200).

## Questions to Consider
- Whose is the strip — eye or finger? Labels at a 480 cutoff while drag is a first-class gesture.
- Should Today end on a closing sentence rather than a red "Over" chip?
- Treat the explainer as data (legend row in every lane) instead of a popover exception?
