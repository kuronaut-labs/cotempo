# Contract tests

The acceptance bar for v1, written before the implementation. **Do not edit anything in this directory.** `npm run check` fails if a file here differs from `MANIFEST.sha256`; only the reviewer regenerates it (`node scripts/check-contract-tests.mjs --write`).

If a contract test seems wrong, stop and report it with the test name and the decision ticket it cites. Do not change the test, and do not change the implementation to satisfy a reading you believe is wrong.

Run one phase: `npm run test:contract -- phase4`. A phase is complete when its contract files pass and `npm run check` is green.

| File | Passes after |
|---|---|
| `unit/phase1-daymath.contract.test.ts` | Phase 1 (already green) |
| `integration/phase3-guards.contract.test.ts` | Phase 3 (already green) |
| `integration/phase4-intervals.contract.test.ts` | Task 4.1 |
| `integration/phase4-structure.contract.test.ts` | Task 4.2 |
| `unit/phase5-attribution.contract.test.ts` | Task 5.1 |
| `integration/phase5-reports.contract.test.ts` | Task 5.1 |
| `unit/phase6-redflags.contract.test.ts` | Task 6.1 |
| `integration/phase6-approvals.contract.test.ts` | Task 6.1 (needs 4.1) |
| `integration/phase7-exports.contract.test.ts` | Task 7.1 |
