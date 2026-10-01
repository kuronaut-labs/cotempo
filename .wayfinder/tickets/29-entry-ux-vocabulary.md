---
id: 29
title: "Entry UX vocabulary and overlap emphasis"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: []
---

## Question

The entry UX pass plan (`docs/2026-09-18-entry-ux-pass.md`) deliberately changes user-visible strings and orders the trio's emphasis. Record the vocabulary decision and the emphasis call, since every other plan copies them.

## Decision (from plan review, Locked Decisions 1 and 3)

- **Vocabulary (LD1):** the unit of logged time is an **entry**; the code keeps `interval`. The third trio value is **Overlap** everywhere — "premium" disappears from UI text and legends. Wall-clock is **On the clock**. Billable stays **Billable**. Effort is **Total of entries**. "Add interval" becomes "Add entry". Record lives in `docs/reports/2026-09-18-ux-terminology.md`, cited from `DESIGN.md` principle 7.
- **Today order (LD2):** date nav → Add entry (compact) → the viewer's own lane → other lanes (collapsed when empty); explainer becomes a `?` popover next to the trio.
- **Overlap emphasis (LD3):** the trio order stays On the clock · Total of entries · Overlap, but a **non-zero Overlap chip is emphasised** (larger value, warm border, `--premium-text` value); zero overlap renders muted. Open question flagged: does emphasising overlap bias operators; revisit after real use — the swap is one CSS class.
- Other mechanics that follow from the plan but are implementation scope: LD4 strip window 06:00–22:00 local expanding to fit entries; LD5 greedy row stacking with full-height hatch and `×N` tag; LD6 "+ Overlap" row action prefills the form (fixed `prefill` state later plans must not break); LD7 one-row compact form with bound Duration/End; LD8 smart start default; LD9 inferred midnight ("Ends next day" note, no checkbox); LD10 empty lanes collapse, own lane never; LD11 Approvals › My weeks newest first.

### Implications

- Every plan's "new copy" list must use entry/Overlap/On the clock — Stage 2's audit copy ('Entry created / edited / deleted') already matches.
- The emphasis rule is presentation-only; trio computation order is unchanged.
