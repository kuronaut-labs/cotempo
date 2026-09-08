# Concurrent Timesheeting Platform v1 Implementation Plan (Phases 0–3, reconciled)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Supersedes Phases 0–3 of `2026-09-06-concurrent-timesheeting-v1.md`. Regenerated 2026-09-07 from `.wayfinder/map.md` after tickets #15–#26 reconciled the first draft against the locked decisions. Phases 4–8 written 2026-09-07.

## Status after the prep spike (2026-09-08)

The repo is scaffolded and every library API this plan names has been checked against the installed versions. Read `CLAUDE.md` (working rules, the gate, protected directories) and `tests/contract/README.md` (the acceptance suite) before any task.

**Already built and green** (`npm run check` passes; 50 tests):

| Task | State |
|---|---|
| 0.1 scaffold, 0.2 env + lint boundary, 0.3 Drizzle + Vitest rigs | done |
| 1.1 `dayMath` / `week` / `money` with the DST matrix | done |
| 1.2 schema + migration `0000` (13 tables) | done |
| 1.3 fixtures + seed (verified idempotent) | done |
| 2.1 BetterAuth instance, mail, handler route (sign-in verified against D1 in tests and through the dev server) | done |
| 2.2 `HttpError`, `getSessionFn`, `getSessionCtxFn` | done; **login / set-password / `_app` layout UI remain** |
| 3.1 session middleware in `start.ts`, 3.2 `authMw` / `requireRole` / guards + tests, 3.3 Zod schemas + tests | done |
| 3.4 invitations | **not started** |
| 4.x–7.x | **stubs with fixed signatures** in `src/lib/attribution.ts`, `src/lib/redFlags.ts`, `src/server/services/*.ts`; contract tests written |

**Corrections found by the spike, already applied in the repo** (the code blocks below have been updated to match):

- Node 24 (`.nvmrc`); npm 11 needs `npm approve-scripts workerd esbuild && npm rebuild workerd esbuild` after install.
- `vite-tsconfig-paths` dropped; Vite 8 has `resolve: { tsconfigPaths: true }`.
- Vitest: the Workers pool cannot resolve the bare `main: "@tanstack/react-start/server-entry"`, so `cloudflareTest({ main: './tests/integration/test-worker.ts' })` points at a stub Worker. `defineConfig(async () => …)` fails type-checking under Vitest 4; use top-level `await`. Four projects: `unit`, `integration`, `contract-unit`, `contract-integration`.
- Route server handler key is `ANY`, not `ALL`.
- BetterAuth's drizzle adapter refuses to start unless `account` also has `access_token`, `refresh_token`, `id_token`, `access_token_expires_at`, `refresh_token_expires_at`, `scope`.
- `src/server/fixtures/demo.ts` imports the schema from `drizzle/schema` directly (not via `~/server/db`) so `scripts/seed.ts` can run under Node.
- `redirect({ to: '/today' })` in `routes/index.tsx` does not type-check until a `/today` route exists, so `src/routes/_app/today.tsx` is a placeholder until Task 4.4.
- Confirmed as written: `.validator()`, `createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' })`, `createMiddleware({ type: 'function' | 'request' })`, `getRouter` / `startInstance` export names, `getRequest` from `@tanstack/react-start/server`, `auth.$context.password.hash`, `auth.api.requestPasswordReset`, `emailAndPassword.resetPasswordTokenExpiresIn`, `sendResetPassword({ user, url, token })`, TanStack Form `setFieldMeta` / `setErrorMap` with `errorMap.onServer`.

**Hand-off order for executors:** 2.2 UI → 3.4 → 4.1 → 4.2 → 4.3 → 4.4a–e → 4.5 → 5.1 → 5.2a–e → 6.1 → 6.2a–d → 7.1 → 7.2 → 8.x. Each task names the contract file that must pass.

**Goal:** Build v1 of a concurrent timesheeting platform for AI-agentic work. Human operators log time for themselves and the AI agents they supervise against overlapping jobs; billing sees the reconciliation trio (billable / honest / premium) everywhere; a weekly approval workflow locks the books.

**Architecture:** TanStack Start (React) on Cloudflare Workers via `@cloudflare/vite-plugin`. Cloudflare D1 through Drizzle. BetterAuth, email+password, invite-only. All UI operations are server functions; server routes exist only for `/api/health` and the BetterAuth handler. Derived data (trio, rollups) is computed from raw intervals on demand. Persisted derived state is limited to approvals and the per-interval rate snapshot.

**Tech stack (versions as of 2026-09-07, research #15):**
- `@tanstack/react-start` 1.168, `@tanstack/react-router`, `@tanstack/react-form`, React 19, Vite 8, `@vitejs/plugin-react` 6
- `@cloudflare/vite-plugin` 1.54, `wrangler` 4.129
- `drizzle-orm` 0.45, `drizzle-kit` 0.31
- `better-auth` 1.7, `@better-auth/drizzle-adapter` 1.7
- `zod` 4.5, `@date-fns/tz`
- `vitest` ^4.1 (not 5; Cloudflare plugin peers on ^4.1), `@cloudflare/vitest-plugin` 1.1
- Node 24 (`.nvmrc`), npm 11
- Resend HTTP API for mail
- Plain CSS with tokens from `.wayfinder/prototypes/`

**Reference artifacts (read-only inputs):**
- `.wayfinder/map.md` — Decisions so far, #3–#26. Every constraint below cites its ticket.
- `.wayfinder/research/03-tanstack-start-cloudflare-2026.md` — exact config snippets and API signatures.
- `.wayfinder/prototypes/entry-ux.html` (Model C = v1 entry), `.wayfinder/prototypes/reporting-ux.html`.

## Global constraints

Every task's requirements include this section.

- **Stack (#3, #15, #20):** Cloudflare Vite plugin, not Nitro. `wrangler.jsonc`, `main: "@tanstack/react-start/server-entry"`, no `assets` block. Env via `import { env } from 'cloudflare:workers'` inside one `src/server/env.ts`, validated lazily with Zod, cached per isolate. No env, DB, or auth access at module scope anywhere.
- **Module boundary (#20):** `src/lib/**` is runtime-agnostic: no imports of `cloudflare:workers` or `~/server/*`. Only `src/server/**` may touch bindings. Lint-enforced.
- **Tenancy:** single org.
- **Workers (#4, #9, #24):** `workers` (id, kind, name, supervisor_id) + `human_workers` (worker_id, user_id, roles JSON) + `agent_workers` (worker_id, model, framework, status). `workers.name` is agent-only; humans display `user.name`. Agents' `supervisor_id` must be a human (app-enforced).
- **Structure (#4, #18, #24):** Client → Project → Job. `jobs.billable_rate_cents` nullable integer; null = non-billable, 0 = billable at $0. No `jobs.status`; `archived_at` hides from pickers.
- **Intervals (#4, #18, #19, #22, #24):** single source of truth. `started_at`/`ended_at` NOT NULL, integer ms, minute-aligned (Zod rejects otherwise). `rate_cents` snapshot copied from the job at create and on job change. `created_by`, `edit_count`, soft-delete via `deleted_at`.
- **Timestamps (#19):** every timestamp column is `integer(..., { mode: 'timestamp_ms' })`, app-supplied, no DB default. Sole exception: `approvals.week_start` is `text` `YYYY-MM-DD` (#23).
- **Archive vs delete (#24):** structure and workers use `archived_at`; intervals use `deleted_at`. Never hard-delete.
- **Overlap model (#7):** duplicate attribution. Same-job overlap is a data error blocked at entry; cross-job overlap is the feature. Trio = wall-clock (union), effort (sum), premium (effort − wall-clock), always shown together.
- **Money (#18):** any displayed figure = `round_half_up(Σ minutes × rate_cents / 60)` in cents, rounded once at the displayed grouping. Invoice authoritative; CSV informational. Hours never round.
- **Timezone (#7, #23):** `ORG_TIMEZONE` Workers var. Day boundaries and approval week keys derived in the org zone via `@date-fns/tz`. Tests cover UTC, America/Los_Angeles, Asia/Kolkata, Australia/Sydney with DST edge days.
- **Roles (#5, #17):** every human is `operator`; `billing` and `admin` additive; admin ⊇ all. Entry/edit scope = self ∪ supervisees, plus everyone for admin. Billing never gains entry rights. Operators see no money.
- **Auth (#8, #16):** BetterAuth email+password, min 12, `disableSignUp: true`. Invitations = admin-session `createUser` (discarded random password) + `requestPasswordReset` with an invitation-worded email; single-use 7-day token; invitee sets own password. Mail failure keeps the invite and offers Resend. Bootstrap admin seeded by hash-and-insert. Roles DB-authoritative on `human_workers.roles`. Agents never authenticate.
- **API (#10, #20, #21, #25):** `createServerFn` for everything UI-driven. Global `requestMiddleware`: `createCsrfMiddleware()` + session loader. Per-fn `.middleware([authMw, requireRole(...)])`, in-body `assertCanEditWorker` / `assertCanViewWorker` / `assertWeeksEditable`. Shared Zod schemas in `src/lib/schemas/`; `.validator()` on every fn. Handler bodies are exported plain `(ctx, input)` functions; the `createServerFn` wrapper is thin. `HttpError` carries `status`, `code`, optional `field`. Cursor pagination default 50 max 200.
- **Forms (#25):** `@tanstack/react-form` on every form with the shared Zod schemas. One `applyServerError(form, err)` maps `err.field` to a field or falls back to form-level.
- **Approval (#12, #17, #26):** per worker per ISO week. Only `approved` locks; `submitted` auto-resets to `draft` on edit with an audit event. Lock binds admin too. Five red flags: gap, late entry, multi edit, retroactive, entered-by-non-supervisor.
- **Tests (#21):** `test.projects`: Node project for `tests/unit`, Workers project via `cloudflareTest()` for `tests/integration`. Migrations via `TEST_MIGRATIONS` + `applyD1Migrations`. One fixture module shared with the seed. `asUser(role)` builds a `SessionContext`; one real sign-in test.
- **Out of scope:** agent auto-entry, framework integrations, client portal, mobile, live timers, timeline drawing, `agent_executions`, multi-level approval, delegation, notifications, thresholds, real-time charts, report builder, multi-tenancy.

---

## File structure

Additions since 2026-09-07: `CLAUDE.md`, `.nvmrc`, `.github/workflows/ci.yml`, `scripts/check-contract-tests.mjs`, `tests/contract/**` (reviewer-owned acceptance suite + `MANIFEST.sha256`), `tests/integration/test-worker.ts`, `tests/env.d.ts`, `src/server/services/{deps,intervals,structure,workers,reports,approvals,exports}.ts`, `src/lib/{attribution,redFlags}.ts`.

```
/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── wrangler.jsonc
├── drizzle.config.ts
├── eslint.config.js
├── .gitignore
├── .dev.vars                      # gitignored
├── .dev.vars.example
├── drizzle/
│   ├── schema.ts                  # all tables
│   └── migrations/                # drizzle-kit output; wrangler migrations_dir
├── scripts/
│   └── seed.ts                    # getPlatformProxy + insertDemo + seedAuthUsers
├── src/
│   ├── start.ts                   # createStart: CSRF + session middleware
│   ├── router.tsx
│   ├── routeTree.gen.ts
│   ├── styles/{tokens.css,global.css}
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── index.tsx              # → /today
│   │   ├── login.tsx
│   │   ├── set-password.$token.tsx  # invite + reset land here
│   │   ├── api/health.ts
│   │   ├── api/auth.$.ts
│   │   └── _app/
│   │       ├── route.tsx
│   │       ├── today.tsx …        # Phase 4+
│   ├── components/                # Phase 4+
│   │   └── forms/applyServerError.ts
│   ├── lib/                       # runtime-agnostic
│   │   ├── dayMath.ts
│   │   ├── week.ts
│   │   ├── money.ts
│   │   ├── errors.ts              # HttpError (isomorphic: client reads .field)
│   │   ├── auth-client.ts
│   │   └── schemas/{intervals,structure,workers,approvals,reports}.ts
│   └── server/                    # Workers-only
│       ├── env.ts                 # getEnv()
│       ├── db.ts                  # getDb()
│       ├── auth.ts                # getAuth()
│       ├── mail.ts
│       ├── context.ts             # SessionContext
│       ├── middleware/{session,authMw,roleGuard}.ts
│       ├── guards/{worker,week}.ts
│       ├── fixtures/demo.ts       # shared by tests + seed
│       └── fns/{auth,invites,…}.ts
└── tests/
    ├── unit/{dayMath,week,money,schemas}.test.ts
    └── integration/
        ├── apply-migrations.ts    # setup file
        ├── helpers.ts             # asUser, resetDb
        └── {session-context,invites,auth-signin}.test.ts
```

---

## Phase 0: Bootstrap

### Task 0.1: Project scaffold on the Cloudflare Vite plugin

**Files:** `package.json`, `tsconfig.json`, `vite.config.ts`, `wrangler.jsonc`, `.gitignore`, `src/router.tsx`, `src/start.ts`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/api/health.ts`

**Produces:** `vite dev` serves on :3000 under workerd; `/api/health` returns `{status:'ok'}`; CSRF middleware installed explicitly (#3 footgun).

- [ ] **Step 1: `package.json`**

```json
{
  "name": "concurrent-timesheeting",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build && tsc --noEmit",
    "preview": "vite preview",
    "deploy": "npm run build && wrangler deploy",
    "test": "vitest run",
    "lint": "eslint .",
    "db:generate": "drizzle-kit generate",
    "db:migrate:local": "wrangler d1 migrations apply timesheeting --local",
    "db:migrate:remote": "wrangler d1 migrations apply timesheeting --remote",
    "db:seed": "tsx scripts/seed.ts",
    "cf-typegen": "wrangler types"
  },
  "dependencies": {
    "@better-auth/drizzle-adapter": "^1.7.3",
    "@date-fns/tz": "^1.2.0",
    "@tanstack/react-form": "^1.0.0",
    "@tanstack/react-router": "^1.168.0",
    "@tanstack/react-start": "^1.168.0",
    "better-auth": "^1.7.3",
    "drizzle-orm": "^0.45.2",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^4.5.0"
  },
  "devDependencies": {
    "@cloudflare/vite-plugin": "^1.54.0",
    "@cloudflare/vitest-plugin": "^1.1.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^6.1.0",
    "drizzle-kit": "^0.31.10",
    "eslint": "^9.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vite": "^8.2.0",
    "vite-tsconfig-paths": "^5.0.0",
    "vitest": "^4.1.0",
    "wrangler": "^4.129.0"
  }
}
```

Run `nvm use && npm install && npm approve-scripts workerd esbuild && npm rebuild workerd esbuild`. Pin exact versions on conflict; do not upgrade Vitest to 5. (The committed `package.json` also has `typescript-eslint`, `@types/node`, and the `test:contract` / `check` scripts; it does not have `vite-tsconfig-paths`.)

- [ ] **Step 2: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "types": ["./worker-configuration.d.ts", "vite/client"],
    "paths": { "~/*": ["./src/*"] }
  },
  "include": ["src", "tests", "scripts", "drizzle", "*.ts", "worker-configuration.d.ts"]
}
```

`worker-configuration.d.ts` comes from `npm run cf-typegen` (Step 5). No `@cloudflare/workers-types`.

- [ ] **Step 3: `vite.config.ts` and `wrangler.jsonc`**

```ts
import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [cloudflare({ viteEnvironment: { name: 'ssr' } }), tanstackStart(), react()],
})
```

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "concurrent-timesheeting",
  "compatibility_date": "2026-09-06",
  "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry",
  "observability": { "enabled": true },
  "vars": {
    "ORG_TIMEZONE": "Australia/Perth",
    "APP_URL": "http://localhost:3000",
    "MAIL_FROM": "Timesheets <onboarding@resend.dev>"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "timesheeting",
      "database_id": "REPLACE_AFTER_CREATE",
      "migrations_dir": "drizzle/migrations"
    }
  ]
}
```

Run `npx wrangler d1 create timesheeting`, paste the id.

- [ ] **Step 4: `.gitignore`**

```
node_modules/
dist/
.wrangler/
.dev.vars
.dev.vars.*
!.dev.vars.example
coverage/
worker-configuration.d.ts
```

- [ ] **Step 5: routes, router, start**

```tsx
// src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <Outlet /> })
```

```tsx
// src/routes/index.tsx
import { createFileRoute, redirect } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  beforeLoad: () => { throw redirect({ to: '/today' }) },
})
```

```ts
// src/routes/api/health.ts
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/api/health')({
  server: { handlers: { GET: () => Response.json({ status: 'ok' }) } },
})
```

```tsx
// src/router.tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export function getRouter() {
  return createRouter({ routeTree, defaultPreload: 'intent' })
}
declare module '@tanstack/react-router' {
  interface Register { router: ReturnType<typeof getRouter> }
}
```

```ts
// src/start.ts
import { createStart, createCsrfMiddleware } from '@tanstack/react-start'

// Defining start.ts drops Start's auto-CSRF; re-add it (#3). Session loader added in 3.1.
export const startInstance = createStart(() => ({
  requestMiddleware: [createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' })],
}))
```

`getRouter` and `startInstance` are the names the Start plugin's generated type footer imports (verified in `@tanstack/start-plugin-core` 1.168). `__root.tsx` must render the `<html>` document with `HeadContent` and `Scripts`; see the committed file. Add `src/routes/_app/today.tsx` as a placeholder component so the `/` redirect type-checks.

- [ ] **Step 6: typegen, dev, commit**

```
npm run cf-typegen && npx tsc --noEmit && npm run dev
```

Expected: `http://localhost:3000/api/health` → `{"status":"ok"}`; `/` redirects to `/today` (404 until Phase 4).

```
git init && git add . && git commit -m "chore: scaffold TanStack Start on Cloudflare Vite plugin"
```

---

### Task 0.2: Env access (#20)

**Files:** `src/server/env.ts`, `.dev.vars.example`, `.dev.vars`, `eslint.config.js`

**Produces:** `getEnv(): Env` — lazy, Zod-validated, cached per isolate. Lint rule keeping `src/lib` runtime-agnostic.

- [ ] **Step 1: `.dev.vars.example` (committed) and `.dev.vars`**

```
BETTER_AUTH_SECRET=replace-with-openssl-rand-hex-32
RESEND_API_KEY=re_xxxxxxxxxxxx
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=choose-12-plus-chars
ADMIN_NAME=First Admin
```

`ADMIN_*` are read only by `scripts/seed.ts`, never by the Worker.

- [ ] **Step 2: `src/server/env.ts`**

```ts
import { env as bindings } from 'cloudflare:workers'
import { z } from 'zod'

const EnvSchema = z.object({
  DB: z.custom<D1Database>((v) => v != null, 'D1 binding missing'),
  BETTER_AUTH_SECRET: z.string().min(32),
  RESEND_API_KEY: z.string().min(10),
  ORG_TIMEZONE: z.string().refine(
    (tz) => Intl.supportedValuesOf('timeZone').includes(tz),
    'ORG_TIMEZONE must be an IANA zone',
  ),
  APP_URL: z.url(),
  MAIL_FROM: z.string().min(3),
})
export type Env = z.infer<typeof EnvSchema>

let cached: Env | undefined

// Call only inside request handlers: D1 methods throw outside a request context.
export function getEnv(): Env {
  cached ??= EnvSchema.parse(bindings)
  return cached
}
```

- [ ] **Step 3: `eslint.config.js`**

```js
import tseslint from 'typescript-eslint'

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ['src/lib/**/*.ts', 'src/lib/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{ name: 'cloudflare:workers', message: 'src/lib is runtime-agnostic (#20)' }],
        patterns: [{ group: ['~/server/*', '**/server/*'], message: 'src/lib is runtime-agnostic (#20)' }],
      }],
    },
  },
)
```

Add `typescript-eslint` to devDependencies.

- [ ] **Step 4: verify and commit**

`npx tsc --noEmit && npm run lint`. Commit `chore: env access via cloudflare:workers + lib boundary lint`.

---

### Task 0.3: Drizzle and Vitest rigs (#21)

**Files:** `drizzle.config.ts`, `drizzle/schema.ts` (placeholder), `vitest.config.ts`, `tests/integration/apply-migrations.ts`, `tests/unit/smoke.test.ts`, `tests/integration/smoke.test.ts`

- [ ] **Step 1: `drizzle.config.ts` and placeholder schema**

```ts
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  dialect: 'sqlite',
  schema: './drizzle/schema.ts',
  out: './drizzle/migrations',
})
```

```ts
// drizzle/schema.ts
export {}
```

- [ ] **Step 2: `vitest.config.ts`**

```ts
import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'

// Top-level await: defineConfig(async () => …) does not type-check under Vitest 4.
const migrations = await readD1Migrations(path.join(import.meta.dirname, 'drizzle/migrations'))

const workers = () =>
  cloudflareTest({
    // The pool cannot resolve the bare `main` from wrangler.jsonc; tests only need bindings.
    main: './tests/integration/test-worker.ts',
    wrangler: { configPath: './wrangler.jsonc' },
    miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
  })
const setupFiles = ['./tests/integration/apply-migrations.ts']

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', environment: 'node', include: ['tests/unit/**/*.test.ts'] } },
      { extends: true, plugins: [workers()], test: { name: 'integration', include: ['tests/integration/**/*.test.ts'], setupFiles } },
      { extends: true, test: { name: 'contract-unit', environment: 'node', include: ['tests/contract/unit/**/*.test.ts'] } },
      { extends: true, plugins: [workers()], test: { name: 'contract-integration', include: ['tests/contract/integration/**/*.test.ts'], setupFiles } },
    ],
  },
})
```

```ts
// tests/integration/test-worker.ts
export default { fetch: () => new Response('test worker') }
```

```ts
// tests/integration/apply-migrations.ts
import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'

// Runs per file outside storage isolation; idempotent.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
```

Add to `tsconfig.json` `types`: `"@cloudflare/vitest-plugin/types"`. `wrangler types` emits `Cloudflare.Env`, so `TEST_MIGRATIONS` is declared by augmenting that namespace in `tests/env.d.ts`:

```ts
import type { D1Migration } from 'cloudflare:test'
declare global {
  namespace Cloudflare {
    interface Env { TEST_MIGRATIONS: D1Migration[] }
  }
}
```

- [ ] **Step 3: smoke tests**

```ts
// tests/unit/smoke.test.ts
import { expect, it } from 'vitest'
it('node pool runs', () => expect(1 + 1).toBe(2))
```

```ts
// tests/integration/smoke.test.ts
import { env } from 'cloudflare:workers'
import { expect, it } from 'vitest'
it('has a D1 binding', async () => {
  const r = await env.DB.prepare('select 1 as one').first<{ one: number }>()
  expect(r?.one).toBe(1)
})
```

- [ ] **Step 4: run and commit**

`npm test` → both projects pass. Commit `chore: drizzle-kit + vitest projects (node + workers)`.

---

## Phase 1: Core utilities and data model

### Task 1.1: `dayMath`, `week`, `money` (TDD; #7, #18, #22, #23)

**Files:** `src/lib/dayMath.ts`, `src/lib/week.ts`, `src/lib/money.ts`, `tests/unit/{dayMath,week,money}.test.ts`

**Interfaces:**

```ts
// src/lib/dayMath.ts
export type Range = { startMs: number; endMs: number }
export type Trio = { wallClockMin: number; effortMin: number; premiumMin: number }
export function assertMinuteAligned(ms: number): void          // throws RangeError
export function minutesBetween(startMs: number, endMs: number): number  // exact
export function mergeRanges(ranges: Range[]): Range[]
export function computeTrio(ivs: Range[]): Trio
export function findSameJobOverlaps(ivs: { workerId: string; jobId: string; startMs: number; endMs: number }[]): { workerId: string; jobId: string; overlapMs: number }[]
export function splitRangeAtBoundaries(range: Range, boundariesMs: number[]): Range[]
export function localDayBoundariesUtcMs(isoDate: string, tz: string): Range
export function localDateOf(ms: number, tz: string): string     // 'YYYY-MM-DD' in tz

// src/lib/week.ts
export function isoWeekStart(ms: number, tz: string): string    // Monday 'YYYY-MM-DD' in tz
export function weekDates(weekStartIso: string): string[]       // 7 dates
export function weekKeysTouched(range: Range, tz: string): string[]  // 1 or 2 keys (#26)

// src/lib/money.ts
export function moneyCents(rows: { minutes: number; rateCents: number | null }[]): number
```

- [ ] **Step 1: failing tests**

Cover (in addition to the 2026-09-06 draft's cases, which still apply):

```ts
// dayMath: minute alignment
expect(() => minutesBetween(0, 90_500)).toThrow(RangeError)

// dayMath: DST days in each zone
const cases = [
  ['2026-03-08', 'America/Los_Angeles', '2026-03-08T08:00:00.000Z', '2026-03-09T07:00:00.000Z'], // spring fwd, 23h
  ['2026-11-01', 'America/Los_Angeles', '2026-11-01T07:00:00.000Z', '2026-11-02T08:00:00.000Z'], // fall back, 25h
  ['2026-09-04', 'Asia/Kolkata',        '2026-09-03T18:30:00.000Z', '2026-09-04T18:30:00.000Z'],
  ['2026-10-04', 'Australia/Sydney',    '2026-10-03T14:00:00.000Z', '2026-10-04T13:00:00.000Z'], // spring fwd
  ['2026-04-05', 'Australia/Sydney',    '2026-04-04T13:00:00.000Z', '2026-04-05T14:00:00.000Z'], // fall back
  ['2026-09-04', 'UTC',                 '2026-09-04T00:00:00.000Z', '2026-09-05T00:00:00.000Z'],
]
for (const [d, tz, s, e] of cases) {
  const b = localDayBoundariesUtcMs(d, tz)
  expect(new Date(b.startMs).toISOString()).toBe(s)
  expect(new Date(b.endMs).toISOString()).toBe(e)
  expect(b.startMs % 60_000).toBe(0)
}

// week: org-zone key, not UTC
// 2026-09-06 23:30 Sydney (Sun) = 2026-09-06T13:30Z → week of 2026-08-31
expect(isoWeekStart(Date.UTC(2026, 8, 6, 13, 30), 'Australia/Sydney')).toBe('2026-08-31')
// 2026-09-06 23:30 LA (Sun) = 2026-09-07T06:30Z → still 2026-08-31 in LA, 2026-09-07 in UTC
expect(isoWeekStart(Date.UTC(2026, 8, 7, 6, 30), 'America/Los_Angeles')).toBe('2026-08-31')
expect(isoWeekStart(Date.UTC(2026, 8, 7, 6, 30), 'UTC')).toBe('2026-09-07')
// crossing Sunday→Monday touches two weeks
expect(weekKeysTouched({ startMs: Date.UTC(2026, 8, 6, 13, 30), endMs: Date.UTC(2026, 8, 6, 14, 30) }, 'Australia/Sydney'))
  .toEqual(['2026-08-31', '2026-09-07'])

// money: round once
expect(moneyCents([{ minutes: 1, rateCents: 10000 }])).toBe(167)          // 166.67 → 167
expect(moneyCents([{ minutes: 1, rateCents: 10000 }, { minutes: 1, rateCents: 10000 }])).toBe(333) // not 334
expect(moneyCents([{ minutes: 60, rateCents: null }])).toBe(0)
expect(moneyCents([{ minutes: 60, rateCents: 0 }])).toBe(0)
```

- [ ] **Step 2: implement**

```ts
// src/lib/dayMath.ts (boundary + date helpers; trio/merge/split as in the 2026-09-06 draft)
import { TZDate } from '@date-fns/tz'

export function assertMinuteAligned(ms: number): void {
  if (ms % 60_000 !== 0) throw new RangeError(`not minute-aligned: ${ms}`)
}

export function minutesBetween(startMs: number, endMs: number): number {
  assertMinuteAligned(startMs); assertMinuteAligned(endMs)
  return (endMs - startMs) / 60_000
}

export function localDayBoundariesUtcMs(isoDate: string, tz: string): Range {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number]
  const startMs = new TZDate(y, m - 1, d, 0, 0, 0, tz).getTime()
  const endMs = new TZDate(y, m - 1, d + 1, 0, 0, 0, tz).getTime()
  return { startMs, endMs }
}

export function localDateOf(ms: number, tz: string): string {
  const t = new TZDate(ms, tz)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
}
```

```ts
// src/lib/week.ts
import { localDateOf, type Range } from './dayMath'

export function isoWeekStart(ms: number, tz: string): string {
  const [y, m, d] = localDateOf(ms, tz).split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  const dow = date.getUTCDay()
  date.setUTCDate(date.getUTCDate() - (dow === 0 ? 6 : dow - 1))
  return date.toISOString().slice(0, 10)
}

export function weekDates(weekStartIso: string): string[] {
  const [y, m, d] = weekStartIso.split('-').map(Number) as [number, number, number]
  const base = Date.UTC(y, m - 1, d)
  return Array.from({ length: 7 }, (_, i) => new Date(base + i * 86_400_000).toISOString().slice(0, 10))
}

// endMs is exclusive, so a range ending exactly at Monday 00:00 touches one week.
export function weekKeysTouched(range: Range, tz: string): string[] {
  const a = isoWeekStart(range.startMs, tz)
  const b = isoWeekStart(range.endMs - 1, tz)
  return a === b ? [a] : [a, b]
}
```

```ts
// src/lib/money.ts
export function moneyCents(rows: { minutes: number; rateCents: number | null }[]): number {
  const numerator = rows.reduce((s, r) => s + r.minutes * (r.rateCents ?? 0), 0)
  return Math.floor(numerator / 60 + 0.5)
}
```

- [ ] **Step 3: pass tests, commit** `feat: dayMath/week/money (org-tz boundaries, exact minutes, round-once cents)`.

---

### Task 1.2: Drizzle schema, final v1 shape (#24 delta)

**Files:** `drizzle/schema.ts`, `src/server/db.ts`, `drizzle/migrations/0000_*.sql`

One migration wave, approvals included.

- [ ] **Step 1: `drizzle/schema.ts`**

```ts
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

const ts = (name: string) => integer(name, { mode: 'timestamp_ms' })

// ---- BetterAuth (admin plugin columns included) ----
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('user'),   // admin-plugin gate only; real roles on human_workers (#8)
  banned: integer('banned', { mode: 'boolean' }).notNull().default(false),
  banReason: text('ban_reason'),
  banExpires: ts('ban_expires'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  token: text('token').notNull().unique(),
  expiresAt: ts('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  impersonatedBy: text('impersonated_by'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  password: text('password'),
  // Unused with email+password only, but the drizzle adapter refuses to start without them.
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: ts('access_token_expires_at'),
  refreshTokenExpiresAt: ts('refresh_token_expires_at'),
  scope: text('scope'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: ts('expires_at').notNull(),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
})

// ---- Workers ----
export const workers = sqliteTable('workers', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['human', 'agent'] }).notNull(),
  name: text('name'),                       // agents only; humans use user.name
  supervisorId: text('supervisor_id'),      // must be a human worker (app-enforced)
  createdAt: ts('created_at').notNull(),
  archivedAt: ts('archived_at'),
})

export const humanWorkers = sqliteTable('human_workers', {
  workerId: text('worker_id').primaryKey().references(() => workers.id),
  userId: text('user_id').notNull().unique().references(() => user.id),
  roles: text('roles').notNull().default('["operator"]'),   // JSON array (#5/#8)
})

export const agentWorkers = sqliteTable('agent_workers', {
  workerId: text('worker_id').primaryKey().references(() => workers.id),
  model: text('model').notNull(),
  framework: text('framework').notNull(),
  status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
})

// ---- Structure ----
export const clients = sqliteTable('clients', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: ts('created_at').notNull(),
  archivedAt: ts('archived_at'),
})

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  name: text('name').notNull(),
  createdAt: ts('created_at').notNull(),
  archivedAt: ts('archived_at'),
})

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  name: text('name').notNull(),
  billableRateCents: integer('billable_rate_cents'),   // null = non-billable, 0 = billable at $0 (#18)
  createdAt: ts('created_at').notNull(),
  archivedAt: ts('archived_at'),
})

// ---- Intervals ----
export const intervals = sqliteTable('intervals', {
  id: text('id').primaryKey(),
  workerId: text('worker_id').notNull().references(() => workers.id),
  jobId: text('job_id').notNull().references(() => jobs.id),
  startedAt: ts('started_at').notNull(),
  endedAt: ts('ended_at').notNull(),
  rateCents: integer('rate_cents'),          // snapshot of job rate at create / job change (#18)
  note: text('note'),
  createdBy: text('created_by').notNull().references(() => workers.id),
  editCount: integer('edit_count').notNull().default(0),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
  deletedAt: ts('deleted_at'),
}, (t) => [
  index('intervals_worker_start').on(t.workerId, t.startedAt).where(sql`${t.deletedAt} IS NULL`),
  index('intervals_job_start').on(t.jobId, t.startedAt).where(sql`${t.deletedAt} IS NULL`),
  index('intervals_start').on(t.startedAt).where(sql`${t.deletedAt} IS NULL`),
])

// ---- Approvals (#12, #23, #26) ----
export const approvals = sqliteTable('approvals', {
  id: text('id').primaryKey(),
  workerId: text('worker_id').notNull().references(() => workers.id),
  weekStart: text('week_start').notNull(),   // 'YYYY-MM-DD' local Monday in org tz; the one non-ms date
  status: text('status', { enum: ['draft', 'submitted', 'approved', 'rejected'] }).notNull().default('draft'),
  submittedAt: ts('submitted_at'),
  submittedBy: text('submitted_by'),
  approvedAt: ts('approved_at'),
  approvedBy: text('approved_by'),
  approvedComment: text('approved_comment'),
  rejectedAt: ts('rejected_at'),
  rejectedBy: text('rejected_by'),
  rejectedReason: text('rejected_reason'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
}, (t) => [uniqueIndex('approvals_worker_week').on(t.workerId, t.weekStart)])

export const approvalEvents = sqliteTable('approval_events', {
  id: text('id').primaryKey(),
  approvalId: text('approval_id').notNull().references(() => approvals.id),
  kind: text('kind', {
    enum: ['submit', 'approve', 'reject', 'unlock', 'edited_after_submit'],
  }).notNull(),
  actorWorkerId: text('actor_worker_id').notNull().references(() => workers.id),
  reason: text('reason'),
  at: ts('at').notNull(),
})
```

- [ ] **Step 2: `src/server/db.ts`**

```ts
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../../drizzle/schema'
import { getEnv } from './env'

let cached: ReturnType<typeof create> | undefined
const create = () => drizzle(getEnv().DB, { schema })

export function getDb() {
  cached ??= create()
  return cached
}
export type Db = ReturnType<typeof getDb>
export { schema }
```

- [ ] **Step 3: generate, apply, verify**

```
npm run db:generate && npm run db:migrate:local
npx wrangler d1 execute timesheeting --local --command "SELECT name FROM sqlite_master WHERE type IN ('table','index') ORDER BY name"
```

Expected: 13 tables (4 auth + workers/human_workers/agent_workers + clients/projects/jobs + intervals + approvals/approval_events) and the four named indexes.

- [ ] **Step 4: commit** `feat: v1 schema (migration 0000)`.

---

### Task 1.3: Shared fixtures and seed (#16, #21)

**Files:** `src/server/fixtures/demo.ts`, `scripts/seed.ts`

**Produces:** `insertDemo(db)` (structure, workers, a week of intervals; deterministic ids), `seedAuthUsers(db, auth, users)` (hash-and-insert, no admin session needed). Seed and tests share both.

- [ ] **Step 1: `src/server/fixtures/demo.ts`**

```ts
import type { Db } from '~/server/db'
import { schema } from '~/server/db'

export const ids = {
  opWorker: 'demo-0000-operator-worker',
  billingWorker: 'demo-0000-billing-worker',
  adminWorker: 'demo-0000-admin-worker',
  agent1: 'demo-0000-agent-1',
  agent2: 'demo-0000-agent-2',
  c1: 'demo-0000-client-1', c2: 'demo-0000-client-2',
  p1: 'demo-0000-project-1', p2: 'demo-0000-project-2',
  j1: 'demo-0000-job-1', j2: 'demo-0000-job-2', j3: 'demo-0000-job-3', j4: 'demo-0000-job-4',
} as const

export const demoHumans = [
  { workerId: ids.adminWorker,   email: 'admin@example.com',   name: 'Demo Admin',    roles: ['operator', 'billing', 'admin'] },
  { workerId: ids.billingWorker, email: 'billing@example.com', name: 'Demo Billing',  roles: ['operator', 'billing'] },
  { workerId: ids.opWorker,      email: 'ops@example.com',     name: 'Demo Operator', roles: ['operator'] },
]

// Intervals are anchored to a fixed Monday so tests are deterministic; the seed
// can shift them to the current week by passing `anchorMs`.
export async function insertDemo(db: Db, opts: { anchorMs?: number; tz: string } ) {
  const now = new Date()
  const anchor = opts.anchorMs ?? Date.UTC(2026, 7, 31)   // 2026-08-31 Monday 00:00Z
  const at = (dayOffset: number, h: number, m = 0) => new Date(anchor + dayOffset * 86_400_000 + (h * 60 + m) * 60_000)

  await db.batch([
    db.insert(schema.workers).values([
      { id: ids.opWorker, kind: 'human', createdAt: now },
      { id: ids.billingWorker, kind: 'human', createdAt: now },
      { id: ids.adminWorker, kind: 'human', createdAt: now },
      { id: ids.agent1, kind: 'agent', name: 'Atlas', supervisorId: ids.opWorker, createdAt: now },
      { id: ids.agent2, kind: 'agent', name: 'Beacon', supervisorId: ids.opWorker, createdAt: now },
    ]).onConflictDoNothing(),
    db.insert(schema.agentWorkers).values([
      { workerId: ids.agent1, model: 'claude-opus-5', framework: 'langgraph' },
      { workerId: ids.agent2, model: 'claude-sonnet-5', framework: 'crewai' },
    ]).onConflictDoNothing(),
    db.insert(schema.clients).values([
      { id: ids.c1, name: 'Acme Aerospace', createdAt: now },
      { id: ids.c2, name: 'Nimbus Freight', createdAt: now },
    ]).onConflictDoNothing(),
    db.insert(schema.projects).values([
      { id: ids.p1, clientId: ids.c1, name: 'Flight Ops Automation', createdAt: now },
      { id: ids.p2, clientId: ids.c2, name: 'Route Optimization', createdAt: now },
    ]).onConflictDoNothing(),
    db.insert(schema.jobs).values([
      { id: ids.j1, projectId: ids.p1, name: 'Pipeline Maintenance', billableRateCents: 14000, createdAt: now },
      { id: ids.j2, projectId: ids.p1, name: 'Eval Harness Runs', billableRateCents: 9000, createdAt: now },
      { id: ids.j3, projectId: ids.p2, name: 'Route Model Tuning', billableRateCents: 12000, createdAt: now },
      { id: ids.j4, projectId: ids.p2, name: 'Internal Data Cleansing', billableRateCents: null, createdAt: now },
    ]).onConflictDoNothing(),
  ])

  const iv = (id: string, workerId: string, jobId: string, rateCents: number | null, d: number, h1: number, h2: number) => ({
    id: `demo-0000-iv-${id}`, workerId, jobId, rateCents,
    startedAt: at(d, h1), endedAt: at(d, h2),
    createdBy: ids.opWorker, createdAt: now, updatedAt: now,
  })
  await db.insert(schema.intervals).values([
    iv('01', ids.opWorker, ids.j1, 14000, 0, 9, 12),
    iv('02', ids.opWorker, ids.j2, 9000, 0, 10, 11),      // overlaps 01 → 60 min premium
    iv('03', ids.agent1, ids.j1, 14000, 0, 9, 17),
    iv('04', ids.agent2, ids.j3, 12000, 0, 13, 16),
    iv('05', ids.opWorker, ids.j2, 9000, 1, 9, 13),
    iv('06', ids.opWorker, ids.j3, 12000, 1, 11, 12),
    iv('07', ids.opWorker, ids.j1, 14000, 2, 14, 18),
    iv('08', ids.opWorker, ids.j4, null, 3, 9, 11),      // non-billable
  ]).onConflictDoNothing()
}

/* Creates BetterAuth user + credential account + human_workers rows without the
   admin plugin, which would need an admin session that does not exist yet. */
export async function seedAuthUsers(
  db: Db,
  auth: { $context: Promise<{ password: { hash(p: string): Promise<string> } }> },
  users: { workerId: string; email: string; name: string; password: string; roles: string[] }[],
) {
  const ctx = await auth.$context
  const now = new Date()
  for (const u of users) {
    const existing = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, u.email)).get()
    const userId = existing?.id ?? crypto.randomUUID()
    if (!existing) {
      const hash = await ctx.password.hash(u.password)
      await db.batch([
        db.insert(schema.user).values({
          id: userId, email: u.email, name: u.name, emailVerified: true,
          role: u.roles.includes('admin') ? 'admin' : 'user', createdAt: now, updatedAt: now,
        }),
        db.insert(schema.account).values({
          id: crypto.randomUUID(), userId, accountId: userId, providerId: 'credential',
          password: hash, createdAt: now, updatedAt: now,
        }),
      ])
    }
    await db.insert(schema.humanWorkers)
      .values({ workerId: u.workerId, userId, roles: JSON.stringify(u.roles) })
      .onConflictDoNothing()
  }
}
```

(Add `import { eq } from 'drizzle-orm'`.) `auth.$context` resolves to `AuthContext` whose `password.hash(password)` is public in 1.7.3 (`@better-auth/core/dist/types/context.d.mts`). Import the schema as `import * as schema from '../../../drizzle/schema'` rather than via `~/server/db`, so the seed can run under Node where `cloudflare:workers` cannot load. `demoHumans` is typed `readonly DemoHuman[]` (not `as const`) so `.includes('admin')` type-checks.

- [ ] **Step 2: `scripts/seed.ts`**

```ts
import { readFileSync } from 'node:fs'
import { getPlatformProxy } from 'wrangler'
import { drizzle } from 'drizzle-orm/d1'
import { betterAuth } from 'better-auth'
import * as schema from '../drizzle/schema'
import { insertDemo, seedAuthUsers, demoHumans, ids } from '../src/server/fixtures/demo'

const devVar = (k: string) => {
  const line = readFileSync('.dev.vars', 'utf8').split('\n').find((l) => l.startsWith(k + '='))
  if (!line) throw new Error(`Missing ${k} in .dev.vars`)
  return line.slice(k.length + 1).trim()
}

const { env, dispose } = await getPlatformProxy<{ DB: D1Database; ORG_TIMEZONE: string }>({ configPath: 'wrangler.jsonc' })
const db = drizzle(env.DB, { schema })
// Only used for its password hasher; adapter config is irrelevant here.
const auth = betterAuth({ secret: devVar('BETTER_AUTH_SECRET'), emailAndPassword: { enabled: true } })

// Anchor demo week to the current ISO Monday so /today has data.
const today = new Date(); today.setUTCHours(0, 0, 0, 0)
const dow = today.getUTCDay()
const monday = today.getTime() - (dow === 0 ? 6 : dow - 1) * 86_400_000

await insertDemo(db, { anchorMs: monday, tz: env.ORG_TIMEZONE })
await seedAuthUsers(db, auth, [
  { workerId: ids.adminWorker, email: devVar('ADMIN_EMAIL'), name: devVar('ADMIN_NAME'), password: devVar('ADMIN_PASSWORD'), roles: ['operator', 'billing', 'admin'] },
  ...demoHumans.filter((h) => h.workerId !== ids.adminWorker).map((h) => ({ ...h, password: 'demo-password-123' })),
])
await dispose()
console.log('seeded')
```

- [ ] **Step 3: run, verify, commit**

```
npm run db:seed
npx wrangler d1 execute timesheeting --local --command "SELECT (SELECT count(*) FROM workers) w, (SELECT count(*) FROM intervals) i, (SELECT count(*) FROM human_workers) h"
```

Expected `w=5 i=8 h=3`. Re-running is a no-op. Commit `feat: shared demo fixtures + seed (hash-and-insert auth users)`.

---

## Phase 2: Auth

### Task 2.1: BetterAuth instance and handler route (#8, #16, #20)

**Files:** `src/server/auth.ts`, `src/server/mail.ts`, `src/routes/api/auth.$.ts`

- [ ] **Step 1: `src/server/mail.ts`**

```ts
import { getEnv } from './env'

export async function sendMail(msg: { to: string; subject: string; html: string }) {
  const env = getEnv()
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, ...msg }),
  })
  if (!res.ok) throw new Error(`mail ${res.status}: ${await res.text()}`)
}
```

- [ ] **Step 2: `src/server/auth.ts`**

```ts
import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { eq } from 'drizzle-orm'
import { getDb, schema } from './db'
import { getEnv } from './env'
import { sendMail } from './mail'

const SEVEN_DAYS = 7 * 24 * 60 * 60

function create() {
  const env = getEnv()
  const db = getDb()
  return betterAuth({
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      disableSignUp: true,                       // invite-only (#8)
      resetPasswordTokenExpiresIn: SEVEN_DAYS,   // doubles as the invite token (#16)
      async sendResetPassword({ user, url }) {
        // No session ever → this is an invitation, not a reset.
        const hasSession = await db.select({ id: schema.session.id }).from(schema.session)
          .where(eq(schema.session.userId, user.id)).get()
        const invite = !hasSession
        await sendMail({
          to: user.email,
          subject: invite ? 'You have been added to Timesheets' : 'Reset your Timesheets password',
          html: invite
            ? `<p>${user.name}, an admin added you to Timesheets. <a href="${url}">Set your password</a> (link valid 7 days).</p>`
            : `<p><a href="${url}">Reset your password</a> (link valid 7 days).</p>`,
        })
      },
    },
    plugins: [admin()],
  })
}

let cached: ReturnType<typeof create> | undefined
export function getAuth() {
  cached ??= create()
  return cached
}
export type Auth = ReturnType<typeof getAuth>
```

`resetPasswordTokenExpiresIn` (seconds) and `sendResetPassword({ user, url, token })` verified in `@better-auth/core` 1.7.3 `init-options.d.mts`; the reset URL is built by BetterAuth from `redirectTo`, which the invite fn passes as `${APP_URL}/set-password`.

- [ ] **Step 3: `src/routes/api/auth.$.ts`** — the catch-all method key is `ANY` (`RouteMethod` in `@tanstack/start-client-core`), not `ALL`.

```ts
import { createFileRoute } from '@tanstack/react-router'
import { getAuth } from '~/server/auth'

export const Route = createFileRoute('/api/auth/$')({
  server: { handlers: { ANY: ({ request }) => getAuth().handler(request) } },
})
```

- [ ] **Step 4: smoke and commit**

`npm run dev -- --port 3123 --strictPort`; `curl localhost:3123/api/auth/ok` → `{"ok":true}`. Sign-in needs `Origin: http://localhost:3000` (the configured `APP_URL`) or BetterAuth answers `INVALID_ORIGIN`. Verified 2026-09-08: sign-in returns a token and `get-session` returns the session; sign-up answers `EMAIL_PASSWORD_SIGN_UP_DISABLED`. Commit `feat: BetterAuth instance (invite-only, 7-day reset token) + handler route`.

---

### Task 2.2: Login, set-password, authed layout (#25)

**Files:** `src/lib/auth-client.ts`, `src/lib/errors.ts`, `src/components/forms/applyServerError.ts`, `src/server/fns/auth.ts`, `src/routes/login.tsx`, `src/routes/set-password.$token.tsx`, `src/routes/_app/route.tsx`

- [ ] **Step 1: error type and form helper**

```ts
// src/lib/errors.ts
export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, readonly field?: string, readonly data?: Record<string, unknown>) {
    super(code)
    this.name = 'HttpError'
  }
}
export const isHttpError = (e: unknown): e is HttpError => e instanceof Error && e.name === 'HttpError'
```

```ts
// src/components/forms/applyServerError.ts
import type { AnyFormApi } from '@tanstack/react-form'

const messages: Record<string, string> = {
  END_BEFORE_START: 'End must be after start.',
  MINUTE_ALIGNMENT: 'Use whole minutes.',
  SAME_JOB_OVERLAP: 'This overlaps another entry on the same job. That would bill one client twice for the same minutes.',
  WEEK_LOCKED: 'This week is approved. Ask an admin to unlock it.',
  FORBIDDEN_TARGET: 'You can only log time for yourself or your supervisees.',
  UNAUTHENTICATED: 'Please sign in again.',
}

// Server errors name a field when one applies (#25); otherwise land form-level.
export function applyServerError(form: AnyFormApi, err: unknown) {
  const code = (err as { code?: string })?.code ?? 'UNKNOWN'
  const field = (err as { field?: string })?.field
  const message = messages[code] ?? (err as Error)?.message ?? 'Something went wrong.'
  if (field && field in form.state.values) form.setFieldMeta(field, (m) => ({ ...m, errorMap: { onServer: message } }))
  else form.setErrorMap({ onServer: message })
}
```

`setFieldMeta(field, updater)` and `setErrorMap(errorMap)` exist on `FormApi` in `@tanstack/form-core` 1.33 and the error map has an `onServer` slot; `AnyFormApi` is exported. Verified 2026-09-08.

- [ ] **Step 2: session server fn (used by `beforeLoad`, not the client SDK, so SSR sees cookies)**

```ts
// src/server/fns/auth.ts
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getAuth } from '~/server/auth'

export const getSessionFn = createServerFn({ method: 'GET' }).handler(async () => {
  const s = await getAuth().api.getSession({ headers: getRequest().headers })
  return s ? { name: s.user.name, email: s.user.email } : null
})
```

- [ ] **Step 3: `src/lib/auth-client.ts`, login, set-password**

```ts
import { createAuthClient } from 'better-auth/react'
export const authClient = createAuthClient()
```

```tsx
// src/routes/login.tsx
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { authClient } from '~/lib/auth-client'
import { applyServerError } from '~/components/forms/applyServerError'
import { getSessionFn } from '~/server/fns/auth'

const LoginInput = z.object({ email: z.email(), password: z.string().min(12) })

export const Route = createFileRoute('/login')({
  beforeLoad: async () => { if (await getSessionFn()) throw redirect({ to: '/today' }) },
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: { onSubmit: LoginInput },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.signIn.email(value)
      if (error) return applyServerError(form, { code: 'AUTH', message: error.message })
      navigate({ to: '/today' })
    },
  })
  return (
    <main className="login-page">
      <h1>Concurrent Timesheeting</h1>
      <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }} className="login-form">
        <form.Field name="email">{(f) => (
          <label>Email <input type="email" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
            {f.state.meta.errors[0] && <span className="field-error">{String(f.state.meta.errors[0])}</span>}</label>
        )}</form.Field>
        <form.Field name="password">{(f) => (
          <label>Password <input type="password" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />
            {f.state.meta.errors[0] && <span className="field-error">{String(f.state.meta.errors[0])}</span>}</label>
        )}</form.Field>
        <form.Subscribe selector={(s) => s.errorMap.onServer}>{(err) => err && <p role="alert" className="form-error">{String(err)}</p>}</form.Subscribe>
        <button type="submit">Sign in</button>
      </form>
    </main>
  )
}
```

```tsx
// src/routes/set-password.$token.tsx  — invite and reset both land here (#16)
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { authClient } from '~/lib/auth-client'
import { applyServerError } from '~/components/forms/applyServerError'

const Input = z.object({ password: z.string().min(12), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] })

export const Route = createFileRoute('/set-password/$token')({ component: SetPasswordPage })

function SetPasswordPage() {
  const { token } = Route.useParams()
  const navigate = useNavigate()
  const form = useForm({
    defaultValues: { password: '', confirm: '' },
    validators: { onSubmit: Input },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.resetPassword({ newPassword: value.password, token })
      if (error) return applyServerError(form, { code: 'AUTH', message: error.message })
      navigate({ to: '/login' })
    },
  })
  // fields as in login; two password inputs + submit "Set password"
  return <main className="login-page">{/* … */}</main>
}
```

- [ ] **Step 4: `src/routes/_app/route.tsx`**

```tsx
import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router'
import { authClient } from '~/lib/auth-client'
import { getSessionFn } from '~/server/fns/auth'

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    const session = await getSessionFn()
    if (!session) throw redirect({ to: '/login' })
    return { session }
  },
  component: AppLayout,
})

function AppLayout() {
  const { session } = Route.useRouteContext()
  const navigate = useNavigate()
  return (
    <div className="app-shell">
      <nav className="app-nav">
        <Link to="/today" activeProps={{ className: 'active' }}>Today</Link>
        <Link to="/reports" activeProps={{ className: 'active' }}>Reports</Link>
        <Link to="/approvals" activeProps={{ className: 'active' }}>Approvals</Link>
        <Link to="/admin/workers" activeProps={{ className: 'active' }}>Admin</Link>
        <span className="nav-spacer" />
        <span className="nav-user">{session.name}</span>
        <button onClick={async () => { await authClient.signOut(); navigate({ to: '/login' }) }}>Sign out</button>
      </nav>
      <Outlet />
    </div>
  )
}
```

`beforeLoad` is UX only; every server fn enforces auth itself (#8/#10).

- [ ] **Step 5: smoke, commit**

Sign in as the seeded admin → redirected to `/today` (404 until Phase 4). Wrong password shows a form-level error. Commit `feat: login, set-password, authed layout (TanStack Form)`.

---

## Phase 3: Server foundation

### Task 3.1: Global session middleware and typed context (#10, #20)

**Files:** `src/server/context.ts`, `src/server/middleware/session.ts`, `src/start.ts`

- [ ] **Step 1: `src/server/context.ts`**

```ts
import type { schema } from './db'

export type Role = 'operator' | 'billing' | 'admin'
export type UserRow = typeof schema.user.$inferSelect
export type SessionRow = typeof schema.session.$inferSelect
export type RawSession = { user: UserRow; session: SessionRow } | null

export type SessionContext = {
  userId: string
  email: string
  name: string
  workerId: string
  roles: Role[]
  superviseeWorkerIds: string[]
}

export const isAdmin = (c: SessionContext) => c.roles.includes('admin')
export const hasRole = (c: SessionContext, ...need: Role[]) => isAdmin(c) || need.some((r) => c.roles.includes(r))
```

- [ ] **Step 2: `src/server/middleware/session.ts`**

```ts
import { createMiddleware } from '@tanstack/react-start'
import { getAuth } from '~/server/auth'
import type { RawSession } from '~/server/context'

// Request middleware: loads the BetterAuth session once per request for every handler.
export const sessionMiddleware = createMiddleware().server(async ({ request, next }) => {
  const rawSession = (await getAuth().api.getSession({ headers: request.headers })) as RawSession
  return next({ context: { rawSession } })
})
```

- [ ] **Step 3: `src/start.ts`**

```ts
import { createStart, createCsrfMiddleware } from '@tanstack/react-start'
import { sessionMiddleware } from '~/server/middleware/session'

export const startInstance = createStart(() => ({
  requestMiddleware: [
    createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' }),
    sessionMiddleware,
  ],
}))
```

- [ ] **Step 4: smoke, commit** `feat: global CSRF + session middleware`.

---

### Task 3.2: `authMw`, `requireRole`, worker and week guards (#5, #8, #17, #26)

**Files:** `src/server/middleware/authMw.ts`, `src/server/middleware/roleGuard.ts`, `src/server/guards/worker.ts`, `src/server/guards/week.ts`, `tests/integration/helpers.ts`, `tests/integration/session-context.test.ts`, `tests/integration/guards.test.ts`

- [ ] **Step 1: `authMw.ts`**

```ts
import { createMiddleware } from '@tanstack/react-start'
import { and, eq, isNull } from 'drizzle-orm'
import { getDb, schema, type Db } from '~/server/db'
import { HttpError } from '~/lib/errors'
import type { RawSession, Role, SessionContext } from '~/server/context'

export async function buildSessionContext(db: Db, raw: NonNullable<RawSession>): Promise<SessionContext> {
  const human = await db.select().from(schema.humanWorkers).where(eq(schema.humanWorkers.userId, raw.user.id)).get()
  if (!human) throw new HttpError(403, 'NO_WORKER_PROFILE')
  const roles = JSON.parse(human.roles) as Role[]
  if (!roles.includes('operator')) throw new HttpError(403, 'ROLES_MISSING_OPERATOR')
  const supervisees = await db.select({ id: schema.workers.id }).from(schema.workers)
    .where(and(eq(schema.workers.supervisorId, human.workerId), isNull(schema.workers.archivedAt))).all()
  return {
    userId: raw.user.id, email: raw.user.email, name: raw.user.name,
    workerId: human.workerId, roles, superviseeWorkerIds: supervisees.map((s) => s.id),
  }
}

export const authMw = createMiddleware({ type: 'function' }).server(async ({ context, next }) => {
  const raw = (context as { rawSession?: RawSession }).rawSession
  if (!raw) throw new HttpError(401, 'UNAUTHENTICATED')
  const sessionCtx = await buildSessionContext(getDb(), raw)
  return next({ context: { sessionCtx } })
})
```

- [ ] **Step 2: `roleGuard.ts`**

```ts
import { createMiddleware } from '@tanstack/react-start'
import { HttpError } from '~/lib/errors'
import { hasRole, type Role, type SessionContext } from '~/server/context'

export const requireRole = (...need: Role[]) =>
  createMiddleware({ type: 'function' }).server(async ({ context, next }) => {
    const c = (context as { sessionCtx?: SessionContext }).sessionCtx
    if (!c) throw new HttpError(401, 'UNAUTHENTICATED')
    if (!hasRole(c, ...need)) throw new HttpError(403, 'FORBIDDEN')
    return next()
  })
```

- [ ] **Step 3: `guards/worker.ts` (#5, #17)**

```ts
import { HttpError } from '~/lib/errors'
import { isAdmin, type SessionContext } from '~/server/context'

const inScope = (c: SessionContext, id: string) => id === c.workerId || c.superviseeWorkerIds.includes(id)

// Entry/edit: self + supervisees; admin anyone; billing gets nothing extra (#17).
export function assertCanEditWorker(c: SessionContext, target: string): void {
  if (isAdmin(c) || inScope(c, target)) return
  throw new HttpError(403, 'FORBIDDEN_TARGET', 'workerId')
}

// View: billing/admin all; operators self + supervisees.
export function assertCanViewWorker(c: SessionContext, target: string): void {
  if (c.roles.includes('billing') || isAdmin(c) || inScope(c, target)) return
  throw new HttpError(403, 'FORBIDDEN_TARGET', 'workerId')
}
```

- [ ] **Step 4: `guards/week.ts` (#26)**

```ts
import { and, eq, inArray } from 'drizzle-orm'
import { schema, type Db } from '~/server/db'
import { HttpError } from '~/lib/errors'

// Only 'approved' locks (#26). Callers pass every week key the mutation touches.
export async function assertWeeksEditable(db: Db, workerId: string, weekKeys: string[]): Promise<void> {
  if (weekKeys.length === 0) return
  const locked = await db.select({ weekStart: schema.approvals.weekStart }).from(schema.approvals)
    .where(and(
      eq(schema.approvals.workerId, workerId),
      inArray(schema.approvals.weekStart, weekKeys),
      eq(schema.approvals.status, 'approved'),
    )).get()
  if (locked) throw new HttpError(409, 'WEEK_LOCKED', undefined, { weekStart: locked.weekStart })
}

/* A mutation on a 'submitted' week drops it back to 'draft' and records why,
   so the approver sees it leave the queue (#26). */
export async function resetSubmittedWeeks(db: Db, workerId: string, weekKeys: string[], actorWorkerId: string): Promise<void> {
  const now = new Date()
  const rows = await db.select({ id: schema.approvals.id }).from(schema.approvals)
    .where(and(
      eq(schema.approvals.workerId, workerId),
      inArray(schema.approvals.weekStart, weekKeys),
      eq(schema.approvals.status, 'submitted'),
    )).all()
  if (rows.length === 0) return
  await db.batch([
    db.update(schema.approvals).set({ status: 'draft', updatedAt: now })
      .where(inArray(schema.approvals.id, rows.map((r) => r.id))),
    db.insert(schema.approvalEvents).values(rows.map((r) => ({
      id: crypto.randomUUID(), approvalId: r.id, kind: 'edited_after_submit' as const, actorWorkerId, at: now,
    }))),
  ])
}
```

- [ ] **Step 5: test helpers and tests**

```ts
// tests/integration/helpers.ts
import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import * as schema from '../../drizzle/schema'
import { insertDemo, demoHumans, ids } from '../../src/server/fixtures/demo'
import type { SessionContext } from '../../src/server/context'

export const db = drizzle(env.DB, { schema })

export async function resetDb() {
  await db.batch([
    db.delete(schema.approvalEvents), db.delete(schema.approvals), db.delete(schema.intervals),
    db.delete(schema.jobs), db.delete(schema.projects), db.delete(schema.clients),
    db.delete(schema.agentWorkers), db.delete(schema.humanWorkers), db.delete(schema.workers),
    db.delete(schema.session), db.delete(schema.account), db.delete(schema.user),
  ])
  await insertDemo(db, { tz: 'Australia/Perth' })
  // human_workers rows without auth users are enough for guard tests
  await db.insert(schema.user).values(demoHumans.map((h) => ({
    id: `user-${h.workerId}`, email: h.email, name: h.name, emailVerified: true,
    role: h.roles.includes('admin') ? 'admin' : 'user', createdAt: new Date(), updatedAt: new Date(),
  }))).onConflictDoNothing()
  await db.insert(schema.humanWorkers).values(demoHumans.map((h) => ({
    workerId: h.workerId, userId: `user-${h.workerId}`, roles: JSON.stringify(h.roles),
  }))).onConflictDoNothing()
}

export function asUser(role: 'operator' | 'billing' | 'admin'): SessionContext {
  const h = demoHumans.find((x) => x.roles.at(-1) === role)!
  return {
    userId: `user-${h.workerId}`, email: h.email, name: h.name, workerId: h.workerId,
    roles: h.roles as SessionContext['roles'],
    superviseeWorkerIds: h.workerId === ids.opWorker ? [ids.agent1, ids.agent2] : [],
  }
}
```

```ts
// tests/integration/guards.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { asUser, db, resetDb } from './helpers'
import { ids } from '../../src/server/fixtures/demo'
import { assertCanEditWorker } from '../../src/server/guards/worker'
import { assertWeeksEditable } from '../../src/server/guards/week'
import * as schema from '../../drizzle/schema'

beforeEach(resetDb)

describe('assertCanEditWorker (#17)', () => {
  it('operator edits self and supervisees only', () => {
    const op = asUser('operator')
    expect(() => assertCanEditWorker(op, ids.opWorker)).not.toThrow()
    expect(() => assertCanEditWorker(op, ids.agent1)).not.toThrow()
    expect(() => assertCanEditWorker(op, ids.billingWorker)).toThrow('FORBIDDEN_TARGET')
  })
  it('billing gains nothing', () => {
    expect(() => assertCanEditWorker(asUser('billing'), ids.opWorker)).toThrow('FORBIDDEN_TARGET')
  })
  it('admin edits anyone', () => {
    expect(() => assertCanEditWorker(asUser('admin'), ids.opWorker)).not.toThrow()
  })
})

describe('assertWeeksEditable (#26)', () => {
  it('approved locks, submitted does not', async () => {
    const now = new Date()
    await db.insert(schema.approvals).values([
      { id: 'a1', workerId: ids.opWorker, weekStart: '2026-08-31', status: 'approved', createdAt: now, updatedAt: now },
      { id: 'a2', workerId: ids.opWorker, weekStart: '2026-09-07', status: 'submitted', createdAt: now, updatedAt: now },
    ])
    await expect(assertWeeksEditable(db, ids.opWorker, ['2026-08-31'])).rejects.toThrow('WEEK_LOCKED')
    await expect(assertWeeksEditable(db, ids.opWorker, ['2026-09-07'])).resolves.toBeUndefined()
    await expect(assertWeeksEditable(db, ids.opWorker, ['2026-09-07', '2026-08-31'])).rejects.toThrow('WEEK_LOCKED')
  })
})
```

`session-context.test.ts`: `buildSessionContext` returns roles + supervisees for the operator, throws `NO_WORKER_PROFILE` for an unknown user (as in the 2026-09-06 draft, now `await`ed).

- [ ] **Step 6: run, commit** `feat: authMw, requireRole, worker + week guards`.

---

### Task 3.3: Shared Zod schemas (#10, #18, #22)

**Files:** `src/lib/schemas/{intervals,structure,workers,approvals,reports}.ts`, `tests/unit/schemas.test.ts`

- [ ] **Step 1: `intervals.ts`**

```ts
import { z } from 'zod'

const minuteAligned = z.iso.datetime().refine((s) => Date.parse(s) % 60_000 === 0, { message: 'MINUTE_ALIGNMENT' })

export const CreateIntervalInput = z.object({
  workerId: z.string().min(1),
  jobId: z.string().min(1),
  startedAt: minuteAligned,
  endedAt: minuteAligned,
  note: z.string().max(500).optional(),
}).refine((v) => Date.parse(v.endedAt) > Date.parse(v.startedAt), { message: 'END_BEFORE_START', path: ['endedAt'] })

export const UpdateIntervalInput = z.object({
  id: z.string().min(1),
  startedAt: minuteAligned.optional(),
  endedAt: minuteAligned.optional(),
  jobId: z.string().min(1).optional(),
  note: z.string().max(500).nullable().optional(),
}).refine((v) => !(v.startedAt && v.endedAt) || Date.parse(v.endedAt) > Date.parse(v.startedAt),
  { message: 'END_BEFORE_START', path: ['endedAt'] })

export const DeleteIntervalInput = z.object({ id: z.string().min(1) })
export const DayQuery = z.object({ date: z.iso.date(), workerId: z.string().min(1).optional() })
export const ListIntervalsInput = z.object({
  workerId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
})
```

No rate field on interval inputs; the server snapshots it (#18).

- [ ] **Step 2: `structure.ts`, `workers.ts`, `approvals.ts`, `reports.ts`**

```ts
// structure.ts
export const CreateClientInput = z.object({ name: z.string().min(1).max(100) })
export const UpdateClientInput = CreateClientInput.extend({ id: z.string().min(1) })
export const CreateProjectInput = z.object({ clientId: z.string().min(1), name: z.string().min(1).max(100) })
export const UpdateProjectInput = z.object({ id: z.string().min(1), name: z.string().min(1).max(100) })
export const CreateJobInput = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(100),
  billableRateCents: z.number().int().min(0).nullable(),   // null = non-billable (#18)
})
export const UpdateJobInput = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  billableRateCents: z.number().int().min(0).nullable().optional(),
})
export const ArchiveInput = z.object({ id: z.string().min(1) })

// workers.ts
export const RoleEnum = z.enum(['operator', 'billing', 'admin'])
export const InviteInput = z.object({
  email: z.email(),
  name: z.string().min(1).max(100),
  roles: z.array(RoleEnum).min(1).refine((r) => r.includes('operator'), { message: 'ROLES_MUST_INCLUDE_OPERATOR' }),
  supervisorId: z.string().min(1).nullable().optional(),
})
export const ResendInviteInput = z.object({ workerId: z.string().min(1) })
export const AgentWorkerInput = z.object({
  name: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  framework: z.string().min(1).max(100),
  status: z.enum(['active', 'inactive']).default('active'),
  supervisorId: z.string().min(1),
})
export const SetRolesInput = z.object({ workerId: z.string().min(1), roles: z.array(RoleEnum).min(1) })
export const SetSupervisorInput = z.object({ workerId: z.string().min(1), supervisorId: z.string().min(1).nullable() })

// approvals.ts
const WeekTarget = z.object({ workerId: z.string().min(1), weekStart: z.iso.date() })
export const SubmitWeekInput = WeekTarget
export const ApproveWeekInput = WeekTarget.extend({ comment: z.string().max(500).optional() })
export const RejectWeekInput = WeekTarget.extend({ reason: z.string().min(1).max(500) })
export const UnlockWeekInput = WeekTarget.extend({ reason: z.string().min(1).max(500) })
export const GetWeekInput = WeekTarget

// reports.ts
export const PeriodInput = z.object({ from: z.iso.date(), to: z.iso.date() })
  .refine((v) => v.to >= v.from, { message: 'TO_BEFORE_FROM', path: ['to'] })
export const DailyReportInput = PeriodInput
```

- [ ] **Step 3: tests** — as in the 2026-09-06 draft plus:

```ts
it('rejects sub-minute timestamps (#22)', () => {
  const r = CreateIntervalInput.safeParse({ workerId: 'w', jobId: 'j',
    startedAt: '2026-09-04T14:00:30.000Z', endedAt: '2026-09-04T15:00:00.000Z' })
  expect(r.success).toBe(false)
})
it('job rate accepts null and 0, rejects negative (#18)', () => {
  expect(CreateJobInput.safeParse({ projectId: 'p', name: 'n', billableRateCents: null }).success).toBe(true)
  expect(CreateJobInput.safeParse({ projectId: 'p', name: 'n', billableRateCents: 0 }).success).toBe(true)
  expect(CreateJobInput.safeParse({ projectId: 'p', name: 'n', billableRateCents: -1 }).success).toBe(false)
})
```

- [ ] **Step 4: commit** `feat: shared Zod schemas`.

---

### Task 3.4: Invitations (#16)

**Files:** `src/server/fns/invites.ts`, `tests/integration/invites.test.ts`, `tests/integration/auth-signin.test.ts`

First real consumer of the middleware chain, so it lands after 3.1–3.3.

- [ ] **Step 1: `src/server/fns/invites.ts`**

```ts
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { InviteInput, ResendInviteInput } from '~/lib/schemas/workers'
import { HttpError } from '~/lib/errors'
import { getAuth, type Auth } from '~/server/auth'
import { getDb, schema, type Db } from '~/server/db'
import { getEnv } from '~/server/env'
import { authMw } from '~/server/middleware/authMw'
import { requireRole } from '~/server/middleware/roleGuard'
import type { SessionContext } from '~/server/context'
import type { z } from 'zod'

type InviteResult = { workerId: string; email: string; mailed: boolean }

/* Admin session is forwarded because the admin plugin refuses createUser without
   one. The random password is never sent anywhere; the reset token is the invite. */
export async function inviteUserHandler(
  deps: { db: Db; auth: Auth; headers: Headers; appUrl: string },
  _ctx: SessionContext,
  input: z.infer<typeof InviteInput>,
): Promise<InviteResult> {
  const { db, auth, headers, appUrl } = deps
  const discarded = crypto.randomUUID() + crypto.randomUUID()
  const created = await auth.api.createUser({
    headers,
    body: { email: input.email, name: input.name, password: discarded, role: input.roles.includes('admin') ? 'admin' : 'user' },
  })
  const userId = created?.user?.id
  if (!userId) throw new HttpError(500, 'CREATE_USER_FAILED')

  const workerId = crypto.randomUUID()
  const now = new Date()
  await db.batch([
    db.insert(schema.workers).values({ id: workerId, kind: 'human', supervisorId: input.supervisorId ?? null, createdAt: now }),
    db.insert(schema.humanWorkers).values({ workerId, userId, roles: JSON.stringify(input.roles) }),
  ])

  const mailed = await sendInvite(auth, input.email, appUrl)
  return { workerId, email: input.email, mailed }
}

async function sendInvite(auth: Auth, email: string, appUrl: string): Promise<boolean> {
  try {
    await auth.api.requestPasswordReset({ body: { email, redirectTo: `${appUrl}/set-password` } })
    return true
  } catch (e) {
    console.error('invite mail failed', e)   // invite persists; admin can Resend (#16)
    return false
  }
}

export async function resendInviteHandler(
  deps: { db: Db; auth: Auth; appUrl: string },
  _ctx: SessionContext,
  input: z.infer<typeof ResendInviteInput>,
): Promise<{ mailed: boolean }> {
  const row = await deps.db.select({ email: schema.user.email }).from(schema.humanWorkers)
    .innerJoin(schema.user, eq(schema.user.id, schema.humanWorkers.userId))
    .where(eq(schema.humanWorkers.workerId, input.workerId)).get()
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'workerId')
  return { mailed: await sendInvite(deps.auth, row.email, deps.appUrl) }
}

const adminOnly = [authMw, requireRole('admin')]

export const inviteUser = createServerFn({ method: 'POST' })
  .middleware(adminOnly)
  .validator(InviteInput)
  .handler(({ data, context }) =>
    inviteUserHandler(
      { db: getDb(), auth: getAuth(), headers: getRequest().headers, appUrl: getEnv().APP_URL },
      (context as { sessionCtx: SessionContext }).sessionCtx, data))

export const resendInvite = createServerFn({ method: 'POST' })
  .middleware(adminOnly)
  .validator(ResendInviteInput)
  .handler(({ data, context }) =>
    resendInviteHandler({ db: getDb(), auth: getAuth(), appUrl: getEnv().APP_URL },
      (context as { sessionCtx: SessionContext }).sessionCtx, data))
```

`auth.api.requestPasswordReset` is the 1.7.3 name (verified in `better-auth/dist/api/index.d.mts`); `forgetPassword` does not exist. Use `ctxOf(context)` from `~/server/middleware/authMw` instead of the inline cast. `getSessionCtxFn` already exists in `fns/auth.ts`.

- [ ] **Step 2: tests**

```ts
// tests/integration/invites.test.ts
// Uses a real BetterAuth built against env.DB with sendResetPassword stubbed to capture the url.
// Cases: (1) invite creates user + worker + human_workers and captures one reset url;
// (2) resendInvite captures a second, different url; (3) a non-admin sessionCtx never reaches
// the handler (assert requireRole via calling the middleware chain or by unit-testing hasRole).
```

```ts
// tests/integration/auth-signin.test.ts
// Seeds the admin via seedAuthUsers, then auth.api.signInEmail({ body }) → asserts a session row exists.
// The one place BetterAuth's cookie path runs against D1 in CI (#21).
```

- [ ] **Step 3: run, commit** `feat: invitations via reset-password token + resend`.

---

## Phase 4: Intervals, structure, entry UI

### Task 4.1: Interval server functions (#7, #17, #18, #22, #26)

**Files:** `src/server/fns/intervals.ts`, `src/server/services/intervals.ts`, `tests/integration/intervals.test.ts`

**Produces:** `createInterval`, `updateInterval`, `deleteInterval`, `listDay`, `listIntervals`. Handler bodies exported from `services/intervals.ts` as `(deps, ctx, input)` functions. **The signatures and return types are already in the stub file; implement the bodies. Contract: `tests/contract/integration/phase4-intervals.contract.test.ts`.**

Rules every mutation applies, in order:

1. `assertCanEditWorker(ctx, workerId)` (#17).
2. Validate the job exists and is not archived; snapshot `rateCents` from it on create and on job change (#18).
3. Same-job overlap check against the worker's live intervals on that job in the affected window (#7). Excludes the interval being edited and soft-deleted rows.
4. `assertWeeksEditable(db, workerId, keys)` where keys = `weekKeysTouched(before) ∪ weekKeysTouched(after)` in the org zone (#26).
5. Write. `edit_count += 1` on update. Soft-delete sets `deleted_at`.
6. `resetSubmittedWeeks(db, workerId, keys, ctx.workerId)` (#26).

- [ ] **Step 1: `src/server/services/intervals.ts`**

```ts
import { and, eq, gt, isNull, lt, ne, gte, lte, desc } from 'drizzle-orm'
import type { z } from 'zod'
import { schema, type Db } from '~/server/db'
import { HttpError } from '~/lib/errors'
import type { SessionContext } from '~/server/context'
import { assertCanEditWorker, assertCanViewWorker } from '~/server/guards/worker'
import { assertWeeksEditable, resetSubmittedWeeks } from '~/server/guards/week'
import { weekKeysTouched } from '~/lib/week'
import { computeTrio, localDayBoundariesUtcMs, type Range } from '~/lib/dayMath'
import type { CreateIntervalInput, UpdateIntervalInput, DeleteIntervalInput, DayQuery, ListIntervalsInput } from '~/lib/schemas/intervals'

type Deps = { db: Db; tz: string; now: () => Date }

async function liveJob(db: Db, jobId: string) {
  const job = await db.select().from(schema.jobs).where(and(eq(schema.jobs.id, jobId), isNull(schema.jobs.archivedAt))).get()
  if (!job) throw new HttpError(404, 'JOB_NOT_FOUND', 'jobId')
  return job
}

async function assertNoSameJobOverlap(db: Db, workerId: string, jobId: string, range: Range, excludeId?: string) {
  const clash = await db.select({ id: schema.intervals.id }).from(schema.intervals).where(and(
    eq(schema.intervals.workerId, workerId),
    eq(schema.intervals.jobId, jobId),
    isNull(schema.intervals.deletedAt),
    lt(schema.intervals.startedAt, new Date(range.endMs)),
    gt(schema.intervals.endedAt, new Date(range.startMs)),
    excludeId ? ne(schema.intervals.id, excludeId) : undefined,
  )).get()
  if (clash) throw new HttpError(409, 'SAME_JOB_OVERLAP', 'jobId', { conflictingId: clash.id })
}

export async function createInterval(deps: Deps, ctx: SessionContext, input: z.infer<typeof CreateIntervalInput>) {
  const { db, tz } = deps
  assertCanEditWorker(ctx, input.workerId)
  const job = await liveJob(db, input.jobId)
  const range = { startMs: Date.parse(input.startedAt), endMs: Date.parse(input.endedAt) }
  await assertNoSameJobOverlap(db, input.workerId, input.jobId, range)
  const keys = weekKeysTouched(range, tz)
  await assertWeeksEditable(db, input.workerId, keys)

  const now = deps.now()
  const row = {
    id: crypto.randomUUID(), workerId: input.workerId, jobId: input.jobId,
    startedAt: new Date(range.startMs), endedAt: new Date(range.endMs),
    rateCents: job.billableRateCents, note: input.note ?? null,
    createdBy: ctx.workerId, createdAt: now, updatedAt: now,
  }
  await db.insert(schema.intervals).values(row)
  await resetSubmittedWeeks(db, input.workerId, keys, ctx.workerId)
  return row
}

export async function updateInterval(deps: Deps, ctx: SessionContext, input: z.infer<typeof UpdateIntervalInput>) {
  const { db, tz } = deps
  const cur = await db.select().from(schema.intervals)
    .where(and(eq(schema.intervals.id, input.id), isNull(schema.intervals.deletedAt))).get()
  if (!cur) throw new HttpError(404, 'NOT_FOUND', 'id')
  assertCanEditWorker(ctx, cur.workerId)

  const before = { startMs: cur.startedAt.getTime(), endMs: cur.endedAt.getTime() }
  const after = {
    startMs: input.startedAt ? Date.parse(input.startedAt) : before.startMs,
    endMs: input.endedAt ? Date.parse(input.endedAt) : before.endMs,
  }
  if (after.endMs <= after.startMs) throw new HttpError(400, 'END_BEFORE_START', 'endedAt')

  const jobChanged = input.jobId !== undefined && input.jobId !== cur.jobId
  const job = jobChanged ? await liveJob(db, input.jobId!) : null
  const jobId = job?.id ?? cur.jobId
  await assertNoSameJobOverlap(db, cur.workerId, jobId, after, cur.id)

  const keys = [...new Set([...weekKeysTouched(before, tz), ...weekKeysTouched(after, tz)])]
  await assertWeeksEditable(db, cur.workerId, keys)

  await db.update(schema.intervals).set({
    startedAt: new Date(after.startMs), endedAt: new Date(after.endMs), jobId,
    rateCents: job ? job.billableRateCents : cur.rateCents,   // snapshot only moves with the job (#18)
    note: input.note === undefined ? cur.note : input.note,
    editCount: cur.editCount + 1, updatedAt: deps.now(),
  }).where(eq(schema.intervals.id, cur.id))
  await resetSubmittedWeeks(db, cur.workerId, keys, ctx.workerId)
}

export async function deleteInterval(deps: Deps, ctx: SessionContext, input: z.infer<typeof DeleteIntervalInput>) {
  const { db, tz } = deps
  const cur = await db.select().from(schema.intervals)
    .where(and(eq(schema.intervals.id, input.id), isNull(schema.intervals.deletedAt))).get()
  if (!cur) throw new HttpError(404, 'NOT_FOUND', 'id')
  assertCanEditWorker(ctx, cur.workerId)
  const keys = weekKeysTouched({ startMs: cur.startedAt.getTime(), endMs: cur.endedAt.getTime() }, tz)
  await assertWeeksEditable(db, cur.workerId, keys)
  await db.update(schema.intervals).set({ deletedAt: deps.now(), updatedAt: deps.now() }).where(eq(schema.intervals.id, cur.id))
  await resetSubmittedWeeks(db, cur.workerId, keys, ctx.workerId)
}

/* Day view: self + supervisees (or one worker), intervals intersecting the local day,
   clipped to the day for the per-worker trio. Time only; no money here (#5). */
export async function listDay(deps: Deps, ctx: SessionContext, input: z.infer<typeof DayQuery>) {
  const { db, tz } = deps
  const day = localDayBoundariesUtcMs(input.date, tz)
  const workerIds = input.workerId ? [input.workerId] : [ctx.workerId, ...ctx.superviseeWorkerIds]
  for (const w of workerIds) assertCanViewWorker(ctx, w)

  const rows = await db.select({
    id: schema.intervals.id, workerId: schema.intervals.workerId, jobId: schema.intervals.jobId,
    jobName: schema.jobs.name, clientName: schema.clients.name,
    startedAt: schema.intervals.startedAt, endedAt: schema.intervals.endedAt,
    note: schema.intervals.note, editCount: schema.intervals.editCount, createdBy: schema.intervals.createdBy,
  }).from(schema.intervals)
    .innerJoin(schema.jobs, eq(schema.jobs.id, schema.intervals.jobId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.jobs.projectId))
    .innerJoin(schema.clients, eq(schema.clients.id, schema.projects.clientId))
    .where(and(
      inArray(schema.intervals.workerId, workerIds),
      isNull(schema.intervals.deletedAt),
      lt(schema.intervals.startedAt, new Date(day.endMs)),
      gt(schema.intervals.endedAt, new Date(day.startMs)),
    )).orderBy(schema.intervals.startedAt).all()

  const clip = (r: { startedAt: Date; endedAt: Date }) => ({
    startMs: Math.max(r.startedAt.getTime(), day.startMs), endMs: Math.min(r.endedAt.getTime(), day.endMs),
  })
  const byWorker = Object.fromEntries(workerIds.map((w) => [w, computeTrio(rows.filter((r) => r.workerId === w).map(clip))]))
  return { day, intervals: rows, trioByWorker: byWorker }
}

export async function listIntervals(deps: Deps, ctx: SessionContext, input: z.infer<typeof ListIntervalsInput>) {
  // cursor = last row's `${startedAt ms}:${id}`; ordered by startedAt desc, id desc (#10)
  if (input.workerId) assertCanViewWorker(ctx, input.workerId)
  else if (!ctx.roles.includes('billing') && !ctx.roles.includes('admin')) throw new HttpError(403, 'FORBIDDEN')
  // …build where from workerId/jobId/from/to (org-tz day bounds), apply cursor, limit+1 → { rows, nextCursor }
}
```

(Add `inArray` to imports.)

- [ ] **Step 2: `src/server/fns/intervals.ts`** — thin wrappers:

```ts
const deps = () => ({ db: getDb(), tz: getEnv().ORG_TIMEZONE, now: () => new Date() })
const ctxOf = (c: unknown) => (c as { sessionCtx: SessionContext }).sessionCtx

export const createInterval = createServerFn({ method: 'POST' }).middleware([authMw]).validator(CreateIntervalInput)
  .handler(({ data, context }) => svc.createInterval(deps(), ctxOf(context), data))
// updateInterval, deleteInterval (POST); listDay, listIntervals (GET) likewise
```

- [ ] **Step 3: tests** (`beforeEach(resetDb)`, `asUser`):

- create snapshots `rateCents` from the job; null for the non-billable job.
- same-job overlap on the same worker → `SAME_JOB_OVERLAP`; different job same time → ok; different worker same job → ok.
- update that moves an interval into an approved week → `WEEK_LOCKED`; moving out of one → `WEEK_LOCKED` too.
- create in a `submitted` week → status becomes `draft` and an `edited_after_submit` event exists.
- edit increments `edit_count`; job change updates `rateCents`; time-only edit keeps it.
- Sunday 23:30→Mon 00:30 (org tz) create with next week approved → `WEEK_LOCKED`.
- billing cannot create for the operator; admin can.
- `listDay` clips a midnight-crossing interval to the day in the trio.

- [ ] **Step 4: commit** `feat: interval server fns (overlap check, rate snapshot, week lock)`.

---

### Task 4.2: Structure and worker admin functions (#5, #16, #24)

**Files:** `src/server/fns/structure.ts`, `src/server/fns/workers.ts`, `src/server/services/{structure,workers}.ts` (stubs exist; implement bodies), `tests/integration/structure.test.ts`

**Contract:** `tests/contract/integration/phase4-structure.contract.test.ts`. Services re-check roles themselves: structure mutations and worker admin fns throw `HttpError(403, 'FORBIDDEN')` unless `isAdmin(ctx)`; `listStructure` includes `billableRateCents` only when `canSeeMoney(ctx)` (omit the key, do not null it). Error codes: `SUPERVISOR_NOT_HUMAN` (400, `supervisorId`), `HAS_SUPERVISEES` (409), `ROLES_MUST_INCLUDE_OPERATOR` (400).

- [ ] **Step 1: structure fns**, all `[authMw, requireRole('admin')]` except reads:
  - `listStructure` (`[authMw]`): full client→project→job tree, unarchived. Includes `billableRateCents` only when `hasRole(ctx, 'billing')`; operators get the tree without rates.
  - `createClient`, `updateClient`, `archiveClient`; same for project and job. Archive cascades nothing; children stay and are filtered by their parent's `archived_at` at read time.
  - `updateJob` changing `billableRateCents` does **not** touch existing intervals (#18).

- [ ] **Step 2: worker fns**:
  - `listWorkers` (`[authMw]`): humans with `user.name`/`user.email`/roles, agents with model/framework/status, supervisor, `inviteState` (`'pending'` if the human has no session row ever, else `'active'`), unarchived. Operators receive only self + supervisees.
  - `createAgentWorker` (admin): validates `supervisorId` is a human.
  - `setRoles` (admin): must keep `operator`. `setSupervisor` (admin): target must be a human or null; a human may supervise humans.
  - `archiveWorker` (admin): sets `archived_at`; refuses if the worker still supervises unarchived workers (`HAS_SUPERVISEES`).
  - `inviteUser`, `resendInvite` from 3.4.

- [ ] **Step 3: tests**: operator gets no rates from `listStructure`; archived job hidden; `archiveWorker` refuses a supervisor with supervisees; `setRoles` without operator → `ROLES_MUST_INCLUDE_OPERATOR`.

- [ ] **Step 4: commit** `feat: structure + worker admin fns`.

---

### Task 4.3: Design tokens and app shell CSS (#6, #11, #13)

**Files:** `src/styles/tokens.css`, `src/styles/global.css`, `src/routes/__root.tsx` (import styles, fonts)

- [ ] Copy the `:root` custom properties verbatim from the `<style>` blocks of `.wayfinder/prototypes/entry-ux.html` and `reporting-ux.html` into `tokens.css` (ink/panel/job palette, Space Grotesk / Inter / IBM Plex Mono, spacing, radii). Load the three fonts from Google Fonts in `__root.tsx` `head`.
- [ ] `global.css`: dark theme body, `.app-shell`, `.app-nav`, `.panel`, `.mono`, form primitives (`.field`, `.field-error`, `.form-error`), the job-color utilities (`.job-c1` … as in the prototype), hatching pattern for overlaps.
- [ ] Commit `feat: design tokens + shell styles from prototypes`.

---

### Task 4.4: Today: retro entry form + day view (#13)

Split into five tasks, one component each, so every step has a props type, a fixture, and a visual check against `.wayfinder/prototypes/entry-ux.html` (Model C). Do them in order; each commits separately. No money anywhere on this page (#5): no component here accepts a rate or cents prop.

**Shared conventions for 4.4a–e:** components live in `src/components/`, are default-less named exports, take plain props (no server calls inside components; the route does the loading), and render minutes with `formatHmm` from `~/lib/money`. Each task adds a Storybook-free "fixture render": a `*.fixture.tsx` file exporting a component rendered with hard-coded props, mounted at `/dev/<name>` behind `import.meta.env.DEV`, so the reviewer can eyeball it next to the prototype.

#### Task 4.4a: `dayMathChip` + `dateNav`

**Files:** `src/components/dayMathChip.tsx`, `src/components/dateNav.tsx`

- `DayMathChip({ trio: Trio })` → three figures wall-clock / effort / premium as `h:mm`, in the prototype's colours, always all three (#11 signature). Premium of 0 still renders.
- `DateNav({ date: string; onChange(date: string): void })` → prev / today / next plus a native `type="date"` input. "Today" is whatever the server said today is (prop), never `new Date()` on the client.
- [ ] Commit `feat(ui): dayMathChip, dateNav`.

#### Task 4.4b: `miniStrip`

**Files:** `src/components/miniStrip.tsx`, `tests/unit/miniStrip.test.ts`

- Props: `{ day: Range; intervals: { id; jobId; startMs; endMs }[]; jobColorIndex: Record<string, number> }`.
- Pure layout helper `stripBlocks(day, intervals)` exported and unit-tested: clips each interval to `[day.startMs, day.endMs)`, returns `{ leftPct, widthPct, clippedStart, clippedEnd }` per interval and `{ leftPct, widthPct, count }` per overlap region (from `mergeRanges` pairwise), so hatching + `×N` tags are data, not CSS guesswork.
- Renders a 24h bar; one block per interval in `.job-c{n}`; overlap regions hatched with the `×N` tag; clipped intervals get a leading `‹` / trailing `›`.
- [ ] Commit `feat(ui): miniStrip with tested block layout`.

#### Task 4.4c: `intervalList`

**Files:** `src/components/intervalList.tsx`

- Props: `{ rows: DayIntervalRow[]; canEdit(workerId: string): boolean; onEdit(id): void; onDelete(id): void }`.
- Columns: job, client, start–end (full times, even when the strip clips), minutes (`h:mm`), note, edit/delete buttons only where `canEdit(row.workerId)`.
- `canEdit` is computed by the route from `getSessionCtxFn` with the same rule as `assertCanEditWorker` (admin, or self/supervisee). UX only; the server re-checks.
- [ ] Commit `feat(ui): intervalList`.

#### Task 4.4d: `entryForm`

**Files:** `src/components/entryForm.tsx`

- Props: `{ date: string; tz: string; workers: WorkerView[]; structure: ClientNode[]; initial?: Partial<...>; onSubmit(input: CreateIntervalInput | UpdateIntervalInput): Promise<void> }`.
- TanStack Form with `CreateIntervalInput` (or `UpdateIntervalInput` when `initial.id`). Worker select: self first, supervisees, agents grouped under "Agents". Job select: client › project › job, unarchived only. Start/end are `type="time" step="60"` combined with `date` in `tz` into ISO strings client-side (use `TZDate` from `@date-fns/tz`; this is the one place the browser touches the zone, and it only uses the string the server sent). Note field.
- Errors via `applyServerError`; `SAME_JOB_OVERLAP` lands on the job field with the prototype's wording; `WEEK_LOCKED` renders form-level with a link to `/approvals?worker=…&week=…` built from `err.data.weekStart`.
- [ ] Commit `feat(ui): entryForm (create + edit)`.

#### Task 4.4e: `/today` route

**Files:** `src/routes/_app/today.tsx` (replace the placeholder), `src/server/fns/intervals.ts` (if not yet wired)

- Search param `?date=YYYY-MM-DD` validated with Zod; default is the server's today (`listDay` returns `date`; the route's loader calls `listDay({ date })` and if no `date` was given, first asks `getTodayFn` — add to `fns/intervals.ts`: returns `localDateOf(Date.now(), tz)`).
- Loader: `listDay`, `listStructure`, `listWorkers`, `getSessionCtxFn` in parallel.
- Layout: `DateNav`; one lane per worker (self first): name, `DayMathChip`, `MiniStrip`, `IntervalList`; `EntryForm` in a panel; edit opens the form pre-filled; delete confirms then `deleteInterval`; every mutation → `router.invalidate()`.
- [ ] Verify with the seeded operator: two overlapping intervals on Monday show a 60-min premium and hatching. Verify the cross-midnight fixture interval (agent Atlas 17:00–01:00 Perth) shows clipped with `›` on Monday and `‹` on Tuesday.
- [ ] Commit `feat: today route`.

---

### Task 4.5: Admin pages (#5, #16)

**Files:** `src/routes/_app/admin/{route,clients,projects,jobs,workers}.tsx`, `src/components/structureTree.tsx`, `src/components/workerRoster.tsx`, `src/components/inviteForm.tsx`

- `admin/route.tsx` `beforeLoad`: fetch `getSessionCtxFn` (add to `fns/auth.ts`: returns `SessionContext` minus nothing sensitive) and redirect non-admins to `/today`. UX only; fns enforce.
- **Clients / Projects / Jobs**: one `structureTree` with inline create/rename/archive per level; job rows show rate as dollars input (`cents/100`), submit as cents. Archived items hidden behind a "show archived" toggle.
- **Workers**: `workerRoster` grouped humans/agents; roles checkboxes (`operator` locked on), supervisor select (humans only), archive. `inviteState === 'pending'` shows a Resend button → `resendInvite`; result toast "Invite sent" / "Mail failed, try again later". Never renders a link or password (#16).
- `inviteForm`: email, name, roles, supervisor → `inviteUser`. `createAgentWorker` form: name, model, framework, supervisor.
- [ ] Commit `feat: admin structure + worker pages`.

---

## Phase 5: Reporting

### Task 5.1: Report server functions (#7, #11, #14, #18)

**Files:** `src/lib/attribution.ts`, `src/server/services/reports.ts` (stubs exist; implement bodies), `src/server/fns/reports.ts`, `tests/unit/attribution.test.ts`, `tests/integration/reports.test.ts`

**Contract:** `tests/contract/unit/phase5-attribution.contract.test.ts`, `tests/contract/integration/phase5-reports.contract.test.ts`. `dayBoundariesWithin(range, tz)` in `dayMath.ts` gives the cut points for `explode`. `adminKpis` throws `FORBIDDEN` itself unless `canSeeMoney(ctx)`.

**Attribution rule (implements #7 for any grouping):** split each interval at local day boundaries into pieces; a piece belongs to its day. For a grouping G (client, worker, day, org), *effort* = Σ piece minutes in G; *wall-clock* = Σ over workers of union(that worker's pieces in G); *premium* = effort − wall-clock; *billable minutes* = Σ piece minutes in G with `rateCents !== null`; *cents* = `moneyCents(pieces in G)` rounded once. Wall-clock is per worker then summed so two people working simultaneously are not collapsed.

- [ ] **Step 1: `src/lib/attribution.ts`** (runtime-agnostic, TDD)

```ts
export type Piece = { workerId: string; jobId: string; clientId: string; day: string; startMs: number; endMs: number; rateCents: number | null }
export function explode(iv: { workerId; jobId; clientId; startMs; endMs; rateCents }, tz: string): Piece[]  // split at day boundaries
export type Recon = Trio & { billableMin: number; cents: number }
export function recon(pieces: Piece[]): Recon
export function groupBy<K extends keyof Piece>(pieces: Piece[], key: K): Map<Piece[K], Piece[]>
```

Tests: a 23:00→01:00 interval explodes into two pieces on the right local days in LA and Sydney; two workers on one client 9–10 give wall-clock 120 not 60; premium equals sum of per-worker premiums; `cents` rounds once across pieces.

- [ ] **Step 2: `services/reports.ts`**

- `loadPieces(db, tz, period, filter?)`: intervals intersecting `[start(from), end(to))` in org tz, joined to job→project→client, exploded, trimmed to the period.
- `reconciliation(deps, ctx, PeriodInput)` → per client `{ clientId, name, ...recon }` + org total. **Money only if `hasRole(ctx,'billing')`; otherwise `cents` is omitted from every row.** Operators are further restricted to pieces for self + supervisees.
- `daily(deps, ctx, PeriodInput)` → `{ days: string[], clients: {id,name}[], cells: Record<day, Record<clientId, Recon>>, totals }` (#14). Same money rule.
- `operatorLanes(deps, ctx, PeriodInput)` → per worker in scope: `Recon` without cents, plus per-day mini series for the read-only mini-timelines (#11 C).
- `adminKpis(deps, ctx, date)` (billing/admin): worker counts, structure counts, today's billable cents, today's premium minutes, utilization = Σ wall-clock / (active humans × 8h) for the day, per-worker utilization bars, today's concurrent-effort series (#11 A).
- `perJob(deps, ctx, PeriodInput)`: hours (and cents for billing) per job (#7 report 3).

- [ ] **Step 3: fns** — `[authMw]` on all; role checks inside since operators get time-only variants. `adminKpis` is `[authMw, requireRole('billing')]`.

- [ ] **Step 4: integration tests**: operator response has no `cents` key anywhere; billing does; daily totals equal reconciliation totals; a non-billable job contributes to effort and wall-clock but not billable minutes or cents.

- [ ] **Step 5: commit** `feat: attribution + report fns`.

---

### Task 5.2: Reports UI (#11, #14)

Split into five tasks. Reference: `.wayfinder/prototypes/reporting-ux.html`. Same component conventions as 4.4 (plain props, fixture render, `formatDecimalHours` for `h.hh`). The response types (`ReconciliationReport`, `DailyReport`, `OperatorLane`, `AdminKpis`, `RoleRecon`) are already in `src/server/services/reports.ts`; components take those types as props. A `RoleRecon` without `cents` must render without a `$` column: check `'cents' in recon`, never assume.

#### Task 5.2a: `trioChip` + `periodSelector` + `subTabs`

**Files:** `src/components/trioChip.tsx`, `src/components/periodSelector.tsx`, `src/components/subTabs.tsx`

- `TrioChip({ recon: RoleRecon; size?: 'sm' | 'lg' })` — the single component for any figure: billable / honest (wall-clock) / premium always together (#11), `$` only when `cents` is present. Minutes as `h.hh`.
- `PeriodSelector({ from, to, onChange })` — presets this week / last week / this month / custom; presets are computed from a `today` prop (server-supplied), not the browser clock.
- `SubTabs({ tabs, active, onChange })` — plain.
- [ ] Commit `feat(ui): trioChip, periodSelector, subTabs`.

#### Task 5.2b: Billing reconciliation

**Files:** `src/components/reconTable.tsx`, `src/components/reconBars.tsx`

- `ReconTable({ report: ReconciliationReport })` — rows per client: name, `TrioChip`, `$` if present; footer = `report.total`.
- `ReconBars({ report })` — horizontal bars per client: wall-clock solid, premium hatched extension, in prototype colours.
- [ ] Commit `feat(ui): reconciliation table + bars`.

#### Task 5.2c: Billing daily

**Files:** `src/components/dailyTable.tsx`

- `DailyTable({ report: DailyReport })` — rows = days, columns = clients, cell = stacked `5.30h` billable / `3.50h` wall / `+1.80h` premium in the prototype's colours; `—` for empty; rows with no time dimmed; footer totals from `report.totals` (#14).
- [ ] Commit `feat(ui): dailyTable`.

#### Task 5.2d: Operator lanes + admin KPIs

**Files:** `src/components/operatorLanes.tsx`, `src/components/kpiTile.tsx`, `src/components/effortBars.tsx`

- `OperatorLanes({ lanes: OperatorLane[] })` — one lane per worker with `DayMathChip` (time only) and a read-only per-day mini-timeline reusing `stripBlocks` from 4.4b. No money.
- `KpiTile({ label, value, hint? })`; `EffortBars({ series: AdminKpis['effortSeries'] })` — hourly effort vs wall-clock, hatched overlap.
- [ ] Commit `feat(ui): operatorLanes, kpiTile, effortBars`.

#### Task 5.2e: `/reports` route

**Files:** `src/routes/_app/reports.tsx`

- Search params `?tab=admin|billing|operator&sub=recon|daily&from=&to=` validated with Zod; default tab = highest role; default period = this week (server today).
- Tabs gated by `getSessionCtxFn` roles (UX only; fns enforce). Admin: KPI strip ×5, worker utilization list, `EffortBars`, structure tree with rates. Billing: `PeriodSelector`, `SubTabs` Reconciliation | Daily, export buttons (wired in Phase 7). Operator: `OperatorLanes`.
- Loader fetches only the fns the active tab needs.
- [ ] Verify: sign in as `ops@example.com` and confirm no `$` anywhere and no `cents` in the network responses; as `billing@example.com` confirm the `$` column.
- [ ] Commit `feat: reports route`.

---

## Phase 6: Approvals

### Task 6.1: Approval server functions and red flags (#12, #17, #26)

**Files:** `src/lib/redFlags.ts`, `src/server/services/approvals.ts` (stubs exist; implement bodies), `src/server/fns/approvals.ts`, `tests/unit/redFlags.test.ts`, `tests/integration/approvals.test.ts`

**Contract:** `tests/contract/unit/phase6-redflags.contract.test.ts`, `tests/contract/integration/phase6-approvals.contract.test.ts`. Services re-check roles (`approve`/`reject` need `hasRole(ctx,'billing')`, `unlock` needs `isAdmin`, else `FORBIDDEN`); `weekStart` not a Monday → `NOT_A_MONDAY` (400, `weekStart`); `submitWeek` upserts the row and is refused when already `submitted` or `approved` (`INVALID_TRANSITION`). Every event's `at` is `deps.now()`; the contract test advances its clock between calls and orders by `at`.

- [ ] **Step 1: `src/lib/redFlags.ts`** (runtime-agnostic)

```ts
export type FlagKind = 'gap' | 'late_entry' | 'multi_edit' | 'retroactive' | 'non_supervisor'
export type Flag = { kind: FlagKind; intervalId?: string; day?: string; detail: string }
export const defaults = { gapMinWallMin: 8 * 60, lateEntryDays: 7, multiEditOver: 2 }

export function redFlags(input: {
  weekStart: string; tz: string; worker: { id: string; supervisorId: string | null }
  intervals: { id: string; startedAt: number; endedAt: number; createdAt: number; editCount: number; createdBy: string }[]
  pieces: Piece[]   // from attribution.explode, for per-day wall-clock
}, cfg = defaults): Flag[]
```

- **gap**: a weekday (Mon–Fri) of the week with no pieces, or wall-clock < `gapMinWallMin` (i.e. >16h unaccounted).
- **late_entry**: `createdAt > end(weekStart+7d) + lateEntryDays`.
- **multi_edit**: `editCount > multiEditOver`.
- **retroactive**: `localDateOf(createdAt) > localDateOf(startedAt)`.
- **non_supervisor** (#17): `createdBy ∉ {worker.id, worker.supervisorId}`.

Tests: one case per flag plus a clean week producing `[]`; weekend days never produce `gap`.

- [ ] **Step 2: `services/approvals.ts`**

```ts
// state machine (#12, #26): only these transitions; anything else → 409 INVALID_TRANSITION
// none|draft|rejected --submit(operator scope)--> submitted
// submitted --approve(billing)--> approved     submitted --reject(billing)--> rejected
// approved --unlock(admin)--> draft            submitted --edit--> draft (guards/week.ts)
```

- `submitWeek(deps, ctx, {workerId, weekStart})`: `assertCanEditWorker` (self, supervisee, or admin). Upserts the approvals row → `submitted`, event `submit`. `weekStart` must be a Monday (`isoWeekStart(ms(weekStart), tz) === weekStart`).
- `approveWeek` / `rejectWeek`: `requireRole('billing')` at the fn; inside, **refuse if `ctx.workerId === workerId` unless `isAdmin(ctx)`** (`SELF_APPROVAL`, 409). Billing users cannot approve their own week; admin can, and the event records it like any other (#5, refined 2026-09-08). Events `approve` / `reject` with comment/reason.
- `unlockWeek`: `requireRole('admin')`; `approved → draft`, event `unlock` with reason.
- `listPendingWeeks` (billing): all `submitted`, with worker name and trio.
- `getWeekForApproval` (billing, or operator for own scope): trio for the week (attribution over the 7 local days), per-interval list with `createdBy` name, `createdAt`, `editCount`, and `redFlags(...)`. Money only for billing/admin.
- `listMyWeeks` (operator): status per week for self + supervisees over the last N weeks, for the submit affordance.

- [ ] **Step 3: fns**, wrappers as before. `submitWeek`, `listMyWeeks`, `getWeekForApproval` → `[authMw]`; `approveWeek`, `rejectWeek`, `listPendingWeeks` → `[authMw, requireRole('billing')]`; `unlockWeek` → `[authMw, requireRole('admin')]`.

- [ ] **Step 4: integration tests**: full happy path submit→approve→unlock→submit→reject→submit→approve with the event log asserted in order; billing self-approve → `SELF_APPROVAL`, admin self-approve succeeds; operator cannot approve (403 from middleware); billing cannot unlock; approve on a `draft` week → `INVALID_TRANSITION`; an interval edit on a submitted week flips it to draft (already covered in 4.1, reference it).

- [ ] **Step 5: commit** `feat: approvals state machine + red flags`.

---

### Task 6.2: Approvals UI (#12)

Split into four tasks. Types (`WeekForApproval`, `PendingWeek`, `MyWeek`, `Flag`) are in `src/server/services/approvals.ts` and `src/lib/redFlags.ts`.

#### Task 6.2a: `weekStatus` + submit affordance on Today

**Files:** `src/components/weekStatus.tsx`, `src/routes/_app/today.tsx`

- `WeekStatus({ week: MyWeek; canSubmit: boolean; hasIntervals: boolean; onSubmit(): void })` — badge draft / submitted / approved / rejected (with `rejectedReason` in a tooltip). "Submit week" button enabled when `canSubmit && hasIntervals`; disabled with a tooltip otherwise.
- Today route: loader adds `listMyWeeks({ weeks: 1 })`; one `WeekStatus` per lane; submit → `submitWeek` then invalidate. `WEEK_LOCKED` from an edit already links here (4.4d).
- [ ] Commit `feat(ui): weekStatus + submit affordance`.

#### Task 6.2b: `approvalsQueue` + `redFlagList`

**Files:** `src/components/approvalsQueue.tsx`, `src/components/redFlagList.tsx`

- `ApprovalsQueue({ weeks: PendingWeek[]; selected?: { workerId; weekStart }; onSelect })` — rows: worker, week (Mon date), `TrioChip`, flag count badge.
- `RedFlagList({ flags: Flag[]; onHover(intervalId?: string): void })` — grouped by kind with the plain-language label per kind (gap, late entry, edited N times, entered after the fact, entered by non-supervisor); hovering a flag calls `onHover(intervalId)`.
- [ ] Commit `feat(ui): approvalsQueue, redFlagList`.

#### Task 6.2c: `approverView`

**Files:** `src/components/approverView.tsx`

- Props: `{ week: WeekForApproval; role: Role[]; onApprove(comment?): Promise<void>; onReject(reason): Promise<void>; onUnlock(reason): Promise<void> }`.
- Headline `TrioChip` (`$` only if `cents` present); per-interval table with audit columns (`createdByName`, `createdAt`, `editCount`) and highlight on flag hover; `RedFlagList`; Approve form (optional comment) and Reject form (required reason) via TanStack Form + `ApproveWeekInput` / `RejectWeekInput`; Unlock form (required reason) only for admin on an `approved` week; audit trail panel listing `week.events` in order with actor names.
- Errors via `applyServerError`: `SELF_APPROVAL` and `INVALID_TRANSITION` land form-level.
- [ ] Commit `feat(ui): approverView`.

#### Task 6.2d: `/approvals` route

**Files:** `src/routes/_app/approvals.tsx`

- Search params `?worker=&week=`. Billing/admin: loader = `listPendingWeeks` + (if selected) `getWeekForApproval`; layout = queue left, `ApproverView` right. Operators: loader = `listMyWeeks({ weeks: 8 })` and, if selected in scope, `getWeekForApproval`; layout = their weeks' statuses with a read-only `ApproverView` (no forms).
- Every action → fn → `router.invalidate()`.
- [ ] Verify the full happy path from the contract test through the UI with `ops` → `billing` → `admin` (unlock).
- [ ] Commit `feat: approvals route`.

---

## Phase 7: Exports

### Task 7.1: CSV export (#11)

**Files:** `src/server/fns/exports.ts`, `src/server/services/exports.ts` (stub exists with the exact column lists; implement bodies), `tests/integration/exports.test.ts`

**Contract:** `tests/contract/integration/phase7-exports.contract.test.ts`. The service returns `{ filename, body }`; the fn wraps it in the `Response`. Service throws `FORBIDDEN` unless `canSeeMoney(ctx)`.

- `exportCsv` (`[authMw, requireRole('billing')]`, GET, `PeriodInput & { view: 'intervals' | 'daily' }`) returns a `Response` with `text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="timesheets-<from>_<to>-<view>.csv"`.
- `intervals` view: one row per **piece** (an interval crossing midnight yields two rows): `worker, kind, client, project, job, day, start, end, minutes, billable_minutes, rate_cents, amount_cents, wall_clock_minutes, premium_minutes, entered_by, created_at, edit_count`. Wall-clock and premium are the worker-day figures repeated on each row of that worker-day. `amount_cents = moneyCents([piece])` rounded per row (informational, #18).
- `daily` view: long format `day, client, billable_minutes, wall_clock_minutes, premium_minutes, amount_cents` (#14).
- Cells quoted per RFC 4180; times ISO in UTC plus a `tz` header row comment? No: add `org_timezone` as a column instead, so the file stays machine-readable.
- Test: sum of `daily` `amount_cents` equals `reconciliation` org total to within the documented per-row rounding; a midnight-crossing interval produces two rows.
- [ ] Wire the Billing tab's "Export CSV" to `exportCsv.url` with the current period and sub-tab (progressive enhancement: plain `<a href>`).
- [ ] Commit `feat: CSV export`.

---

### Task 7.2: Printable invoice (#11)

**Files:** `src/routes/_app/invoice.$clientId.tsx`, `src/server/fns/invoice.ts`, `src/styles/print.css`

- `invoiceData` (`[authMw, requireRole('billing')]`, `{ clientId, from, to }`): client, period, line items per job (`job, project, billable hours as h.hh, rate $/h, amount $` from `moneyCents(pieces of that job)` rounded per line), subtotal = Σ lines (#18: invoice authoritative), reconciliation footer trio (billable / wall-clock / premium, with the premium described as the concurrent-work disclosure), generated-at, org timezone.
- Route renders a single A4-ish page; `print.css` hides nav and buttons under `@media print`; "Print / Save as PDF" button calls `window.print()`. No server PDF generation in v1.
- Billing tab "Export PDF" opens `/invoice/$clientId?from&to` for the selected client, or one tab per client for "all".
- [ ] Commit `feat: printable invoice view`.

---

## Phase 8: Deploy

### Task 8.1: Remote D1, secrets, first deploy

**Files:** `wrangler.jsonc` (prod id), `scripts/seed-admin-remote.ts`, `package.json` scripts

- [ ] **Step 1:** `npx wrangler d1 create timesheeting` (remote) if not already; put the id in `wrangler.jsonc` `database_id`. Local dev keeps emulating under the same id.
- [ ] **Step 2:** secrets: `npx wrangler secret put BETTER_AUTH_SECRET`, `npx wrangler secret put RESEND_API_KEY`. Set production `vars` (`APP_URL` to the workers.dev or custom domain, `ORG_TIMEZONE`, `MAIL_FROM` from a verified Resend domain) in `wrangler.jsonc`; use a `[env.production]`-style `env` block if local and prod vars must differ.
- [ ] **Step 3:** `npm run db:migrate:remote`.
- [ ] **Step 4: `scripts/seed-admin-remote.ts`** — `getPlatformProxy` is local-only, so this script hashes the password with BetterAuth's hasher and writes one SQL file (user, account, workers, human_workers for the admin only; no demo data), then runs `wrangler d1 execute timesheeting --remote --file`. Reads `ADMIN_*` from `.dev.vars` or prompts. Add `"db:seed:admin:remote": "tsx scripts/seed-admin-remote.ts"`.
- [ ] **Step 5:** `npm run deploy`. Verify `https://<worker>/api/health` → `{status:'ok'}`, sign in as the admin, invite a real address, complete set-password from the email.
- [ ] **Step 6:** Commit `chore: production config + remote admin seed`.

### Task 8.2: CI

**Files:** `.github/workflows/ci.yml` (already written)

- On push/PR: contract-manifest check, lint, tsc, `npm test`, `npm run test:contract` (non-blocking until Phase 7 lands: remove `continue-on-error` then), `vite build`.
- On `main`: `wrangler deploy` with `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets, after `wrangler d1 migrations apply timesheeting --remote`.
- [ ] Flip `test:contract` to blocking. Commit `chore: CI contract suite blocking`.

---

## Done criteria for v1

- Operator: signs in, logs minute-aligned intervals for self and agents on Today, sees the trio and hatching, cannot see a rate anywhere, submits a week.
- Billing: sees reconciliation and daily tables with dollars, approves/rejects with red flags visible, exports CSV and prints an invoice; cannot approve their own week.
- Admin: manages structure and workers, invites by email, unlocks a week; the unlock and every transition appear in the audit trail.
- Editing an interval in an approved week fails with `WEEK_LOCKED` for everyone; editing one in a submitted week returns it to draft.
- Changing a job's rate leaves past intervals' amounts unchanged.
- `npm test` green on both projects; DST test matrix passes for the four zones.
