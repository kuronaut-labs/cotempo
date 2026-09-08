---
id: 22
title: "Minute alignment: enforce exact-minute intervals at the boundary?"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: [19]
---

## Question

#7 locks "exact minutes everywhere, no rounding in storage or derived views" and #13's retro form takes typed start and end times. The v1 plan's interval schema accepts any ISO timestamp with sub-minute precision, and `minutesBetween` rounds. Nothing prevents a 10:00:30 start.

Decide:

1. Is minute alignment a validation rule (reject seconds ≠ 0 in the Zod schema and at the DB), a normalisation rule (truncate or round on write), or not enforced (store what the form sends and round in `dayMath`)?
2. If enforced, where: Zod refinement only, or also a CHECK constraint given the encoding chosen in #19?
3. Does the day-boundary split in #7 ever produce sub-minute pieces (a DST-shifted midnight in the org timezone), and if so how are they attributed?

Output: the validation rule and the `dayMath` contract (integer minutes in, integer minutes out). Record as a refinement on #7.

## Resolution

Closed by wayfinder after grilling with user (2026-09-07). All three recommendations accepted.

### Rule

- `CreateIntervalInput` and `UpdateIntervalInput` refine `startedAt`/`endedAt`: parsed ms `% 60_000 === 0`, else `MINUTE_ALIGNMENT`. Zod only; no CHECK constraint.
- `dayMath` contract: inputs are minute-aligned ms; `minutesBetween` becomes exact division and throws in dev if the remainder is non-zero. No rounding anywhere.
- Day-split pieces are minute-aligned by construction: IANA offsets are minute-granular, so local midnight is a whole minute. `splitRangeAtBoundaries` asserts this rather than handling remainders.

### Implications

- #7 refined: "exact minutes" now enforced at the API edge.
- Plan Task 3.3 schemas and Task 1.1 `dayMath` updated. Seed data must be minute-aligned (it is).
- #23 (timezone) must produce minute-aligned boundaries; any library or hand-rolled approach satisfies this.
