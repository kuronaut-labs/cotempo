---
id: 23
title: "Timezone strategy for org-timezone day boundaries"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: []
---

## Question

#7 splits period-crossing intervals at day boundaries in a single org-level timezone. The v1 plan's `localDayBoundariesUtcMs` measures the UTC offset at local noon via `Intl.DateTimeFormat` and applies it to midnight, which is wrong on DST transition days. The plan acknowledges this and ships it anyway.

Decide:

1. Hand-rolled `Intl` arithmetic (fixed to iterate to true local midnight), a small library (`@date-fns/tz`, `date-fns-tz`, Temporal polyfill), or native `Temporal` if the Workers runtime supports it by build time (research #15 may note this)?
2. Where the org timezone lives: a Workers var (as the plan has it), a settings row in D1, or both with the var as bootstrap?
3. Week boundaries for #12 approval: does the ISO-Monday week key follow the org timezone as well? The plan's `week.ts` uses UTC dates.
4. Test matrix: which zones must the unit tests cover (UTC, a DST zone, a non-hour-offset zone like Asia/Kolkata, a southern-hemisphere DST zone)?

Output: the library or approach, the storage location for the setting, and the required test cases. Record as a refinement on #7.

## Resolution

Closed by wayfinder after grilling with user (2026-09-07). All four recommendations accepted.

### Decisions

- **Library:** `@date-fns/tz`. `localDayBoundariesUtcMs(isoDate, tz)` builds `new TZDate(y, m, d, 0, 0, tz)` for start and the next day for end. The plan's noon-offset arithmetic is deleted.
- **Setting:** `ORG_TIMEZONE` Workers var, read via `getEnv()` (#20). Validated as an IANA zone at first access (`Intl.supportedValuesOf('timeZone')` or a try/format). No settings table in v1; changing it is a deploy.
- **Week key:** derived in the org zone. `isoWeekStart(startMs, tz)` converts the interval start to a local date first, then rolls back to Monday. Day and week keys always agree. Both helpers take `tz` explicitly; `src/lib` stays runtime-agnostic.
- **Tests:** UTC, America/Los_Angeles, Asia/Kolkata, Australia/Sydney. For each DST zone: a spring-forward day (23h) and a fall-back day (25h), asserting boundary ms and that split pieces stay minute-aligned (#22).

### Implications

- #7 refined: org-zone boundaries via `@date-fns/tz`, week key follows the same zone.
- #12 approval week key is org-zone based; `approvals.week_start` stores the local Monday as `YYYY-MM-DD` text (a calendar key, not an instant), unaffected by #19's ms rule.
- Plan Task 1.1 (`dayMath`, `week`) rewritten; `@date-fns/tz` added to dependencies.
- #24 must record `approvals.week_start` as text date.
