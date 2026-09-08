---
id: 15
title: "Research: current TanStack Start on Cloudflare Workers build, bindings, and test setup"
labels: [wayfinder:research]
status: closed
assignee: wayfinder
blocked-by: []
---

## Question

Ticket #3 and research #1 describe TanStack Start deploying to Cloudflare via Nitro presets, and the v1 plan (`docs/2026-09-06-concurrent-timesheeting-v1.md`) inherited that layout (`main = ".output/server/index.mjs"`, no Cloudflare Vite plugin). Current Cloudflare and TanStack docs point at `@cloudflare/vite-plugin` with the Start server entry instead.

Surface the facts, do NOT recommend:

1. Vite + wrangler config for Start on Workers today (plugin, `main`, assets, compat flags).
2. How server functions and middleware access D1 bindings and secrets (`cloudflare:workers` env import vs request-scoped env; module-scope caveats; `.dev.vars` and `wrangler secret`).
3. Current `createStart` / `createMiddleware` / `createServerFn` signatures and method names, including CSRF middleware.
4. `@cloudflare/vitest-pool-workers` setup: current plugin form, D1 migrations in tests, isolated storage, mixing a Node unit project with a Workers project.
5. Drizzle on D1: async-only, migration workflow, batch vs transactions.
6. BetterAuth on Workers/D1: `auth.api.createUser` session-header requirement; built-in options for invite-only account creation with recipient-set passwords.
7. Current version numbers for the stack.

Feeds #20 (bindings access pattern), #21 (test fixtures), #16 (invitation flow), and the plan rewrite.

Findings go to `.wayfinder/research/03-tanstack-start-cloudflare-2026.md`.

## Resolution

Research completed 2026-09-07. Findings written to [.wayfinder/research/03-tanstack-start-cloudflare-2026.md](../research/03-tanstack-start-cloudflare-2026.md) (42 sources).

**Key findings:**
- **Build:** `@cloudflare/vite-plugin` is the official path; plugin order `cloudflare({ viteEnvironment: { name: 'ssr' } })` → `tanstackStart()` → `react()`. Nitro is not involved. `wrangler.jsonc` with `main: "@tanstack/react-start/server-entry"` and `nodejs_compat`; no `assets` block needed.
- **Bindings:** Cloudflare's guide uses `import { env } from 'cloudflare:workers'` inside server functions. Module-scope reads work for vars/secrets but D1 calls outside a request context throw. `.dev.vars` locally, `wrangler secret put` in production.
- **API:** `createStart(() => ({ requestMiddleware, functionMiddleware }))`; `createMiddleware({ type: 'function' })` for server-fn middleware; `.validator()` is current and `.inputValidator()` deprecated; `createCsrfMiddleware()` auto-installed only when `src/start.ts` is absent.
- **Testing:** pool renamed `@cloudflare/vitest-plugin`, `cloudflareTest()` plugin, per-file isolation, requires Vitest ^4.1 (Vitest 5 outside peer range). D1 migrations in tests via `readD1Migrations` + `applyD1Migrations` through a `TEST_MIGRATIONS` binding. Node + Workers combined via `test.projects`.
- **Drizzle/D1:** async-only; transactions rejected, use `db.batch()`.
- **BetterAuth:** adapter moved to `@better-auth/drizzle-adapter`; 1.5+ accepts a raw D1 binding. Admin operations require an authenticated admin session. Invite-only levers: `disableSignUp`, `sendResetPassword`, magic-link with `disableSignUp`, organization invitations.
- **Versions (2026-09-07):** react-start 1.168.50, vite 8.2.2, @cloudflare/vite-plugin 1.54.4, wrangler 4.129.0, @cloudflare/vitest-plugin 1.1.4, drizzle-orm 0.45.2, drizzle-kit 0.31.10, better-auth 1.7.3, zod 4.5.4.

**Gap:** tanstack.com API reference pages for `createServerFn`/`createMiddleware`/CSRF returned 404; those facts come from the GitHub `main` docs and source.

Unblocks #16, #20, #21.
