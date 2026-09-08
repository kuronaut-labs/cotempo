---
id: 21
title: "Integration test fixture strategy for the Workers test pool"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: [15]
---

## Question

The v1 plan's integration tests (Task 3.2) rely on demo data seeded by running the seed scripts through wrangler in a child process, then assert against deterministic demo ids. The Workers vitest pool isolates storage per test file and provides `env.DB` directly, so out-of-band seeding does not reach the test database.

Decide:

1. How migrations are applied in tests: the pool's D1 migration helpers in a setup file, or Drizzle's migrator against `env.DB`?
2. Fixtures: a shared TypeScript fixture module inserting rows through Drizzle in `beforeAll`, or the seed SQL reused verbatim? Should the demo seed and the test fixtures be the same code?
3. Per-test isolation: rely on the pool's isolated storage, or truncate between tests?
4. Auth in tests: construct BetterAuth against `env.DB` and create sessions programmatically, or bypass the session layer and call `buildSessionContext` directly (as the plan does)?

Output: the `tests/integration/setup.ts` shape and the fixture rule. Feeds the rewrite of plan Tasks 0.3 and 3.2.

## Resolution

Closed by wayfinder after grilling with user (2026-09-07). All four recommendations accepted. Replaces the plan's child-process seeding and SQL-string seed.

### Setup

- `vitest.config.ts` uses `test.projects`: a Node project for `tests/unit/**`, a Workers project via `cloudflareTest()` (`@cloudflare/vitest-plugin`, Vitest ^4.1 per #15) for `tests/integration/**`.
- Workers project declares a `TEST_MIGRATIONS` binding pointing at `drizzle/migrations`. `tests/integration/setup.ts` runs `readD1Migrations` + `applyD1Migrations` against `env.DB` once per file.
- Isolation is the pool's per-file storage. `resetDb()` (delete all rows, re-insert fixtures) runs in `beforeEach` only in files whose tests mutate.

### Fixtures

- One module, `src/server/fixtures/demo.ts`: deterministic ids (`demo-0000-*`), the demo dataset (structure, workers, intervals across a week, in cents and ms per #18/#19), and `insertDemo(db)`.
- Tests call `insertDemo(drizzle(env.DB))`. The seed script calls the same function against `getPlatformProxy().env.DB`. One dataset, one writer.
- Auth users for demo humans are created by the seed's hash-and-insert path (#16); tests that need them call the same helper.

### Auth in tests

- `asUser(role)` returns a `SessionContext` for the matching demo human. Handler logic is exercised by calling the extracted handler functions with that context, bypassing BetterAuth.
- One test builds BetterAuth against `env.DB`, signs in the seeded admin, asserts a session row. Covers the cookie path once.

### Implications

- Plan Task 0.3 (Vitest workspace, Vitest 3) and Task 1.3 (SQL-generating seed) are rewritten. Task 3.2's test drops the child-process seeding.
- Server fns are structured so the handler body is an exported plain function that takes `(ctx, input)`; the `createServerFn` wrapper is thin. That is what makes `asUser` usable.
- No new tickets.
