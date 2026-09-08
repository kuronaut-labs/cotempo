---
id: 20
title: "Bindings and secrets access pattern in server functions"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: [15]
---

## Question

The v1 plan reads env three different ways: `process.env` (Task 0.2), a module-scope `import { env } from 'cloudflare:workers'` (Task 2.1), and a lazily required singleton for the BetterAuth instance. Research #1 warned that module-scope env reads are wrong on edge runtimes. Research #15 surfaces what the Cloudflare Vite plugin actually supports today.

Decide:

1. Global `cloudflare:workers` env import versus request-scoped env threaded through `requestMiddleware` into typed context. Which does the plan adopt for D1, secrets, and vars?
2. Where the BetterAuth and Drizzle instances are constructed: per request, or once per isolate? What are the cold-start and correctness tradeoffs on Workers?
3. How Node unit tests avoid importing anything that touches `cloudflare:workers`, so `dayMath`, `week`, and the Zod schemas stay runnable in the Node pool.
4. Env validation: Zod at startup, per request, or rely on `wrangler types`?

Output: one paragraph on the pattern plus the module boundary rule (which files may import bindings). Feeds the rewrite of plan Tasks 0.2, 2.1, 3.1.

## Resolution

Closed by wayfinder after grilling with user (2026-09-07). All four recommendations accepted. **Replaces all three env approaches in the plan (process.env, module-scope import, lazy require).**

### Pattern

- **One entry point:** `src/server/env.ts` does `import { env } from 'cloudflare:workers'` and exports `getEnv()`. On first call it parses `env` with a Zod schema (`DB` as `D1Database`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `ORG_TIMEZONE`, `APP_URL`, `MAIL_FROM`) and caches the validated object for the isolate's lifetime. A missing secret throws once with a clear message.
- **Always inside a handler.** Nothing calls `getEnv()`, `getDb()`, or `getAuth()` at module top level. Per research #15, module-scope vars work but D1 I/O outside a request context throws; the rule is simpler than the exception, so it applies to all three.
- **Lazy per-isolate singletons:** `getDb()` wraps `drizzle(getEnv().DB, { schema })`; `getAuth()` wraps `betterAuth({...})`. Both build on first call inside a request and are reused. Construction does no I/O.
- **No context plumbing for env.** Middleware context carries `rawSession` and `sessionCtx` (#10), not env.
- **Types:** `wrangler types` generates the binding interface; the tsconfig `types` array drops `@cloudflare/workers-types` in favour of the generated file.
- **Local vs deployed:** `.dev.vars` for local secrets, `[vars]` in wrangler config for non-secret vars, `wrangler secret put` for production secrets.

### Module boundary

- `src/lib/**` is **runtime-agnostic**: `dayMath`, `week`, Zod schemas, shared types. It never imports `cloudflare:workers`, `src/server/**`, or anything that does.
- `src/server/**` is Workers-only and is the only place `cloudflare:workers` may appear.
- `src/routes/**` and `src/components/**` import server functions (RPC stubs on the client) and `src/lib`, never `src/server/env.ts` or `src/server/auth.ts` directly.
- **Enforced** by an eslint `no-restricted-imports` rule scoped to `src/lib/**` (banning `cloudflare:workers` and `~/server/*`), and by the Node vitest project including only `tests/unit/**`.

### Implications

- **#3:** deployment detail refined — Cloudflare Vite plugin + `cloudflare:workers`, not Nitro. Stack choice unchanged.
- **#10:** middleware context shape confirmed (session only); conventions gain `src/server/env.ts`.
- **Plan:** Task 0.2 (`process.env`) and Task 2.1 (`require`) collapse into one env task done right; Task 2.1's auth singleton becomes `getAuth()` per above; `db.ts` moves from `src/lib` to `src/server` to respect the boundary.
- **#21 (test fixtures):** integration tests run in the Workers pool, so `getEnv()` resolves against the test `env`; unit tests never touch it.
- Fog item "Approval lock enforcement surface" is now specifiable → graduated to #26.
