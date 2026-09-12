# Concurrent Timesheeting

A multi-tenant timesheeting platform for human operators who supervise AI agents. The platform reconciles **billable** (one job per minute, picked by priority rules) against **wall-clock** (real minutes on the clock) and an unavoidable **premium** (the gap) — exposing what concurrent work actually costs.

Built for AI-agentic shops where one operator can supervise two or three agents in parallel and needs to bill honestly without inflating the clock.

## The trio (every money page shows this)

| Seg | What it is | Who needs it |
|---|---|---|
| **Billable** | one rate per minute, picked by job priority and overlap rules | invoicing |
| **Wall-clock** | real minutes elapsed | the customer's auditor |
| **Premium** | the gap — concurrent work the bill does not cover | the operator, the supervisor |

The trio is the same shape on the day, the week, the month, the per-job rollup, and the invoice. The math is computed from raw intervals on every read; no derived rollup table.

## Stack

- **TanStack Start** (React 19) on **Cloudflare Workers** via `@cloudflare/vite-plugin`
- **Cloudflare D1** (SQLite) through **Drizzle ORM**
- **BetterAuth** with email + password, invite-only
- **Zod** schemas shared between the wire, the services, and the forms
- **@tanstack/react-form** with a shared `applyServerError` helper

## Roles

| Role | Sees | Does |
|---|---|---|
| **operator** | self + supervised agents | creates / edits / deletes own time |
| **billing** | everyone | reads the trio with money, runs the invoice |
| **admin** | everyone | manages structure (clients, projects, jobs, workers), invites, runs approvals |

Roles are stackable. A person can be operator + billing + admin.

## Repo layout

| Path | What lives there |
|---|---|
| `src/lib/` | pure (no `cloudflare:workers`, no DB, no auth) — `dayMath`, `week`, `money`, `attribution`, `redFlags`, `schemas/`, `errors` |
| `src/server/services/` | business logic as exported `(deps, ctx, input)` functions |
| `src/server/fns/` | thin `createServerFn` wrappers over the services |
| `src/server/middleware/` | `authMw`, `requireRole`, `session` |
| `src/server/guards/` | `assertCanEditWorker`, `assertWeeksEditable` |
| `src/server/fixtures/demo.ts` | the seed: org, humans, agents, jobs, intervals |
| `src/routes/_app/` | the actual app — `today`, `reports`, `approvals`, `invoice`, `admin/*` |
| `drizzle/` | schema and generated migrations |
| `tests/unit/` | pure-logic tests (Vitest, no Workers) |
| `tests/integration/` | service tests against a local D1 (Vitest Workers pool) |
| `tests/contract/` | **acceptance suite** — read-only, gated by `MANIFEST.sha256` |
| `scripts/` | `seed.ts` (local), `seed-admin-remote.ts` (prod admin bootstrap) |

See `CLAUDE.md` for the non-negotiable working rules (guard order in every interval mutation, money-stripping for non-billing, integer-ms timestamps, never hard-delete, fixed stub signatures, etc.).

## Quick start (local)

```sh
# Node 24; nvm use
nvm use
npm install
npm approve-scripts workerd esbuild && npm rebuild workerd esbuild

# Local D1 + seed
npm run db:migrate:local
npm run db:seed

# Dev server (port 3123 to dodge 3000 collisions)
npm run dev -- --port 3123 --strictPort
```

Seed creates three logins:

| Email | Password | Roles |
|---|---|---|
| `admin@example.com` | from `.dev.vars` `ADMIN_PASSWORD` | operator + billing + admin |
| `billing@example.com` | `demo-password-123` | operator + billing |
| `ops@example.com` | `demo-password-123` | operator |

`wrangler.jsonc` ships `APP_URL=http://localhost:3000`; for BetterAuth flows (password reset emails, sign-in `Origin` checks) test against the same port or change the value locally.

## Tests

```sh
npm run check                    # contract-manifest + lint + tsc + unit + integration
npm run test:unit                # ~pure
npm run test:integration         # services against local D1
npm run test:contract            # the acceptance suite (used to gate CI)
npm run test:contract -- phaseN  # one contract file
```

`tests/contract/**` is read-only — byte-locked by `tests/contract/MANIFEST.sha256`. The reviewer (only) regenerates the manifest after a contract change with `node scripts/check-contract-tests.mjs --write`.

## Deploy (Cloudflare)

```sh
# 1. Create the D1 database and paste the real database_id into wrangler.jsonc
npx wrangler d1 create timesheeting

# 2. Set the two secrets
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put RESEND_API_KEY

# 3. Edit wrangler.jsonc: swap APP_URL and MAIL_FROM to production values
#    (workers.dev URL or custom domain; verified Resend sender).

# 4. Migrate + build + deploy
npm run db:migrate:remote
npm run deploy

# 5. Seed the production admin (hashes ADMIN_PASSWORD with BetterAuth and
#    writes INSERT/INSERT...ON CONFLICT SQL via wrangler d1 execute --remote)
npm run db:seed:admin:remote
```

## Routes

| Path | What it does |
|---|---|
| `/login`, `/set-password` | BetterAuth flows |
| `/today` | the operator's day: clip-by-day form, live trio, red flags |
| `/reports` | rollups: recon (per-job, per-period, per-client), daily table, operator lanes, admin KPIs, CSV export |
| `/invoice` | printable invoice: per-job lines + recon footer; pick a client, print to PDF |
| `/approvals` | queue, submit / approve / reject / unlock weeks; audit log |
| `/admin/*` | clients, projects, jobs, workers, invites |

## Design tokens

Copy `:root` from `.wayfinder/prototypes/*.html` to keep any new view in the same visual language. The invoice route and the printable page use `src/styles/print.css`.

## License

UNLICENSED — internal project.
