---
id: 14
title: "Reporting daily breakdown view"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: [11]
---

## Question

The current reporting prototype (#11) shows period totals per client and an org-total trio. The user wants **each day** to appear in the reports as well — daily breakdown within a selected period.

1. **Where does the daily view live?** Sub-tab within Billing (alongside Reconciliation), inline-expandable rows in the existing table, or a new top-level Daily tab?
2. **Shape of the daily view?** Table (rows = days, columns = clients, cells = trio per client-day), calendar heatmap (7×N grid, color intensity = volume), or stacked bars (one bar per day, stacked by client)?
3. **Coexistence with period reconciliation?** Both visible (daily + reconciliation), daily replaces reconciliation (period totals as header), or daily embedded in the reconciliation table as expandable rows?
4. **Does this change approval granularity?** #12 locked per-worker-per-week approval. Does daily become an approval unit too, or is it read-only reporting?

## Context

- #11 reporting prototype at `.wayfinder/prototypes/reporting-ux.html` — three tabs (Admin / Billing / Operator), signature = reconciliation trio shown everywhere a number is shown.
- #7 locked period-crossing intervals split proportionally (org timezone) — daily boundaries are derived from the org timezone, not user timezone.
- #12 locked per-worker-per-week approval with soft lock + re-approval. The daily view is a reporting concern; whether it interacts with approval is a fresh decision.
- The reporting prototype has been served at http://localhost:8766/reporting-ux.html.

Out of scope (unchanged): live timers, timeline drawing in v1 (both v2).

## Resolution

Closed by wayfinder after grilling with user. All three sub-questions confirmed against the recommended options. Q4 (approval interaction) ruled out — daily view is reporting only; #12 per-week approval stands.

### Daily view shape

| Aspect | Decision |
|---|---|
| Location | **Sub-tab within Billing** — alongside Reconciliation. Period selector and export buttons are shared at the Billing-tab level. |
| Shape | **Table: days × clients × trio** — rows = days in the selected period, columns = clients, cells = trio (billable / honest / premium) per client-day. Footer row = period totals. |
| Coexistence | **Both visible, separate sub-tabs** — Reconciliation sub-tab keeps the period-summary framing; Daily sub-tab provides the day-by-day cut. Same trio everywhere. |
| Approval | **No change.** Daily view is read-only reporting. #12 per-worker-per-week approval is unchanged. |

### Cell format

Each daily cell renders the trio stacked vertically:

```
 5.30h    ← billable (pos green)
 3.50h    ← wall-clock (text)
+1.80h    ← premium (j4 amber)
```

Empty days/cells render `—` (faint); rows with no activity get a subtle opacity dim so the active rows stand out.

### Demo data

The prototype's interval dataset was extended from a single day to a full week (Mon 31 Aug – Sun 6 Sep 2026) so the Daily sub-tab has meaningful content. Each interval now carries `d` (day offset from today). Admin's "Today's concurrent effort" and Operator's lanes are filtered to today only (`d===0`) so they remain "today" surfaces; the Billing sub-tabs use the full 7-day set.

### Implications

- **#4 (data model):** No change. Daily view is a query on intervals by date — already supported.
- **#7 (billing rules):** No change. Period-crossing interval splitting already handles the daily boundary.
- **#10 (API design):** No new server fn. Existing reporting fns are extended to accept a `groupBy: 'day' | 'period'` parameter (or a separate `dailyRecon` fn is added) — implementation choice at build time.
- **#11 (reporting):** Daily sub-tab added to Billing. Reconciliation sub-tab unchanged. The reconciliation trio signature is reinforced — it now appears in three places (per-client table, org-total trio, daily cells).

### Out of scope (not added)

- Daily as approval unit (#12 unchanged)
- Per-worker breakdown within daily cells (click-through to drill into a day)
- Heatmap or stacked-bar alternative (table only in v1)
- Export of daily view separately (CSV/PDF export applies to whatever sub-tab is active; daily export = long-format day/client/trio rows)

## Status

Closed. Recorded on map as Decision #14.
