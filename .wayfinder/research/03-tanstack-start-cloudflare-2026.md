# TanStack Start (React) on Cloudflare Workers + D1 — state of play

Research date: 2026-09-07. Facts only; no recommendations. Snippets are quoted from official docs or read from published source/npm metadata.

## 1. Vite config

- Both TanStack and Cloudflare docs use `@cloudflare/vite-plugin`. TanStack hosting guide: "The official Cloudflare Workers setup currently uses Vite through `@cloudflare/vite-plugin`." Install: `pnpm add -D @cloudflare/vite-plugin wrangler`.
- Plugin order, identical in both docs (cloudflare first, then tanstackStart, then react):

```ts
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    react(),
  ],
});
```

- Cloudflare vite-environments reference on `viteEnvironment.name: "ssr"`: "This merges the Worker's environment configuration with the framework's SSR configuration and ensures that the Worker is included as part of the framework's build output."
- Nitro: not involved on the Cloudflare path. TanStack hosting guide describes Nitro as "an agnostic layer that allows you to deploy TanStack Start applications to a wide range of hostings" and lists it as an alternative target, not a dependency. `@tanstack/react-start@1.168.50` has no `nitropack`/`nitro` dependency. Nitro's own example (nitro.build) shows a separate `nitro()` Vite plugin for non-Cloudflare hosts.
- Scaffold: `npm create cloudflare@latest -- my-tanstack-start-app --framework=tanstack-start`.
- Scripts (Cloudflare guide): `"dev": "vite dev"`, `"build": "vite build"`, `"preview": "vite preview"`, `"deploy": "npm run build && wrangler deploy"`, `"cf-typegen": "wrangler types"`. TanStack's variant adds `&& tsc --noEmit` to build.

## 2. Wrangler config

- Cloudflare: "Cloudflare recommends using `wrangler.jsonc` for new projects, and some newer Wrangler features will only be available to projects using a JSON config file."
- Cloudflare TanStack guide `wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "<YOUR_PROJECT_NAME>",
  "compatibility_date": "2026-09-06",
  "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry",
  "observability": { "enabled": true }
}
```

- Assets: no `assets` block needed. Vite plugin static-assets reference: "The `assets.directory` field in this file is automatically populated with the path to your `client` build output. It is therefore not necessary to provide the `assets.directory` field in your input Worker configuration." `vite build` emits an output `wrangler.json` in `dist/`, which `wrangler deploy` uses.
- D1 block (wrangler configuration reference): `binding` (required), `database_name` (required), `database_id` (required), `preview_database_id` (optional, used by `wrangler dev`), `migrations_dir` (optional). Drizzle's example:

```jsonc
"d1_databases": [
  { "binding": "DB", "database_name": "YOUR DB NAME", "database_id": "YOUR DB ID", "migrations_dir": "drizzle" }
]
```

## 3. Bindings and secrets in server code

- Cloudflare's TanStack guide: "Import the env object in server-side code" via `import { env } from "cloudflare:workers";` and use `env.MY_KV` etc. inside `createServerFn()` handlers. TanStack's own docs do not document env access; they expose `getRequest()`, `getRequestHeader()`, `setResponseHeaders()`, `setResponseStatus()` from `@tanstack/react-start/server`.
- Module-scope caveat (Workers bindings docs): "Workers do not allow I/O from outside a request context. This means that even though `env` is accessible from the top-level scope, you will not be able to access every binding's methods." Env vars, secrets, and `env.NAMESPACE.get` (DO stub) work at module scope; KV/D1/service calls do not (`env.KV.get('my-key')` at top level "would error"). Inside a handler everything works. Rationale given: "avoid passing `env` as an argument through many function calls".
- `withEnv()` is documented for overriding `env` values (testing).
- Secrets: "Put secrets for use in local development in either a `.dev.vars` file or a `.env` file, in the same directory as the Wrangler configuration file." "If you define a `.dev.vars` file, then values in `.env` files will not be included." `.dev.vars.<env>` takes precedence over `.dev.vars` when `CLOUDFLARE_ENV` is set. Vite plugin: "The `vite build` command copies the relevant `.dev.vars` file to the output directory. This is only used when running `vite preview` and is not deployed with your Worker." Production: `wrangler secret put <NAME>` — "creates a new version of the Worker and deploys it immediately". Secrets never go in `vars`.
- Vite plugin options: `configPath`, `config`, `viteEnvironment`, `persistState` (default `.wrangler/state`), `inspectorPort` (default 9229), `remoteBindings` (default `true`), `auxiliaryWorkers`.

## 4. createStart, middleware, server functions, CSRF

- Global middleware (`src/start.ts`):

```ts
import { createStart, createMiddleware } from '@tanstack/react-start'
export const startInstance = createStart(() => ({
  requestMiddleware: [/* all requests: SSR, server routes, server fns */],
  functionMiddleware: [/* server functions only */],
}))
```

- `createMiddleware({ type })`: `type` is optional and defaults to `'request'` (source: `type?: TType`, default `type: 'request'`). Server-function middleware must pass `{ type: 'function' }` to get `.client()`/`.validator()`; request middleware has `.middleware()` and `.server()` only. `next({ context })` merges into downstream context; client→server context requires `sendContext` and docs say to validate it server-side.
- Validator method name: current docs and source use `.validator()`. `.inputValidator()` still exists but is marked `/** @deprecated Use 'validator' instead. */` in `createServerFn.ts` and `createMiddleware.ts` (main branch). Validators accept Standard Schema (`~standard`), `.parse()` objects (zod), or functions.
- Chain: `createServerFn({ method: 'GET' | 'POST', strict? }).middleware([...]).validator(schema).handler(async ({ data, context, signal }) => ...)`. `.middleware()` calls merge. Docs show `{ data }`; `context` is populated from middleware.
- CSRF: "TanStack Start provides `createCsrfMiddleware()` to protect server functions from cross-site requests. If your app does not define `src/start.ts`, Start installs this middleware automatically for server functions. If you define `src/start.ts`, add the middleware explicitly." Usage: `createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' })` in `requestMiddleware`; options `origin: 'https://app.example.com'`, `allowRequestsWithoutOriginCheck: true`. Header-only check (`Sec-Fetch-Site`/`Origin`/`Referer`); requests with none of those are rejected by default.

## 5. Testing with Vitest on workerd

- Package rename: `@cloudflare/vitest-pool-workers` → `@cloudflare/vitest-plugin`. Migration guide: "The package API and Vitest configuration are unchanged" (import swap + `types` field; a codemod exists). Both currently peer on `vitest ^4.1.0`. Docs: "The @cloudflare/vitest-plugin package requires Vitest 4.1 or later." Vitest 5.0.0 shipped 2026-09-03 and is outside that peer range.
- Vitest 3→4 guide: "Version 0.13.0 rearchitects the integration around a Vite plugin model." `defineWorkersProject`/`defineWorkersConfig`/`poolOptions.workers` replaced by the `cloudflareTest()` plugin. "The `isolatedStorage` and `singleWorker` options were removed." "Storage isolation is now per test file, matching Vitest's own isolation model." Shared storage: `--max-workers=1 --no-isolate`. Test imports: `import { env, exports } from "cloudflare:workers"` replaces `env, SELF` from `cloudflare:test`; `fetchMock` removed. "Custom Vitest environments or runners are not supported."
- Install: `npm i -D vitest@^4.1.0 @cloudflare/vitest-plugin`. `test/tsconfig.json`: `"types": ["@cloudflare/vitest-plugin/types"]`. Typing bindings: `declare module "cloudflare:workers" { interface ProvidedEnv extends Env {} }`.
- D1 migrations in tests (workers-sdk `fixtures/vitest-plugin-examples/d1`):

```ts
// vitest.config.ts
import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
  return {
    plugins: [cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
    })],
    test: { setupFiles: ["./test/apply-migrations.ts"] },
  };
});
// test/apply-migrations.ts
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
// Setup files run outside the per-test-file storage isolation, and may be run
// multiple times. `applyD1Migrations()` only applies migrations that haven't
// already been applied, therefore it is safe to call this function here.
await applyD1Migrations(env.DATABASE, env.TEST_MIGRATIONS);
```

  Signature: `applyD1Migrations(db, migrations, migrationTableName?)`. Migrations dir here is wrangler/D1 SQL format (what `drizzle-kit generate` emits when `migrations_dir` points at the drizzle `out`).
- Node + Workers in one config: Vitest `test.projects` (workspace "deprecated since 3.2 and replaced with the `projects` configuration"). The fixture uses `defineProject` + `mergeConfig` per project; a Node project is an inline `{ extends: false, test: { name: 'node', environment: 'node', include: [...] } }` entry alongside a project whose `plugins: [cloudflareTest(...)]`.
- Known issues: module resolution errors need `deps.optimizer`; always await storage I/O and consume response bodies or isolation breaks; `additionalExports` for virtual-module builds.

## 6. Drizzle on D1

- `import { drizzle } from 'drizzle-orm/d1'; const db = drizzle(env.DB)`. D1 is async-only; Drizzle exposes `.all()`, `.get()`, `.values()`, `.run()` awaited.
- Transactions: D1 rejects `BEGIN TRANSACTION` ("ERROR 9014: disallowed query"; drizzle-orm issues #758, #2463). D1 docs: "Batched statements are SQL transactions. If a statement in the sequence fails, then an error is returned for that specific statement, and it aborts or rolls back the entire sequence." and "D1 operates in auto-commit." Drizzle `db.batch([...])` maps to this.
- Migrations: `npx drizzle-kit generate` → SQL files in `out`; apply with `wrangler d1 migrations apply <DB> --local` / `--remote` (wrangler reads `migrations_dir`), or via drizzle-kit over HTTP:

```ts
export default defineConfig({
  out: './drizzle', schema: './src/db/schema.ts',
  dialect: 'sqlite', driver: 'd1-http',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
    token: process.env.CLOUDFLARE_D1_TOKEN!,
  },
});
```

  "Drizzle Kit lets you run `migrate`, `push`, `introspect` and `studio` commands using Cloudflare D1 HTTP API." `push` is positioned for dev iteration.

## 7. BetterAuth on Workers/D1

- Adapter now lives in its own package: `import { drizzleAdapter } from "@better-auth/drizzle-adapter"`; `database: drizzleAdapter(db, { provider: "sqlite", schema })`. Peer: `drizzle-orm ^0.45.2 || >=1.0.0-rc.1`.
- Since 1.5 a D1 binding can be passed directly: `betterAuth({ database: env.DB })` — "Pass your D1 binding directly — no custom adapter setup required." "D1 does not support interactive transactions — Better Auth uses D1's `batch()` API for atomicity instead."
- Because the D1 binding is request/env-scoped, community guides build the `auth` instance per request (or lazily from `cloudflare:workers` env) rather than as a module singleton; BetterAuth docs assume a global `db`.
- Admin plugin: docs state "Before performing any admin operations, the user must be authenticated with an admin account." The server example for `auth.api.createUser({ body: { email, password, name, role, data } })` is shown without `headers`; `password` is listed as required. `auth.api.setUserPassword({ body: { newPassword, userId }, headers })` "requires session cookies". `adminUserIds: []`, `adminRoles: ["admin"]`.
- Server API generally: "Some endpoints might require headers"; `returnHeaders: true` / `asResponse: true` to get Set-Cookie; failures throw `APIError`.
- Invite-only options in BetterAuth itself:
  - `emailAndPassword.disableSignUp` — "Disable email and password sign up (default: `false`)"; `sendResetPassword({ user, url, token })` and `resetPasswordTokenExpiresIn` (default 3600s) give a set-password flow via `requestPasswordReset`.
  - Magic link plugin: `sendMagicLink({ email, url, token, metadata })`, `expiresIn` default 300s, `disableSignUp` (default `false`), `metadata` forwarded (docs example `metadata: { inviteId: "123" }`).
  - Organization plugin: `createInvitation`/`inviteMember`, `sendInvitationEmail` required, `acceptInvitation` "after the user is logged in" with a session whose email matches; `requireEmailVerificationOnInvitation`. Does not itself create accounts.

## 8. Versions on npm, 2026-09-07

| package | latest | note |
|---|---|---|
| @tanstack/react-start | 1.168.50 | peer `vite >=7.0.0` |
| @tanstack/zod-adapter | 1.167.0 | |
| vite | 8.2.2 | 8.0.0 released 2026-03-12 |
| @vitejs/plugin-react | 6.1.1 | |
| @cloudflare/vite-plugin | 1.54.4 | peer `vite ^6.1.0 || ^7.0.0 || ^8.0.0`, `wrangler ^4.129.0` |
| wrangler | 4.129.0 | |
| @cloudflare/vitest-plugin | 1.1.4 | peer `vitest ^4.1.0` |
| @cloudflare/vitest-pool-workers | 0.22.0 | legacy name, same peer |
| vitest | 5.0.0 | released 2026-09-03; 4.1.0 released 2026-03-12 |
| drizzle-orm | 0.45.2 | |
| drizzle-kit | 0.31.10 | |
| better-auth | 1.7.3 | |
| @better-auth/drizzle-adapter | 1.7.3 | |
| zod | 4.5.4 | |

Tradeoffs surfaced by the above: Vitest 5 is out but the Cloudflare plugin peers on ^4.1; Vite 8 is supported by both plugins; `.inputValidator` compiles but is deprecated; module-scope `env` works for secrets but not D1 calls; D1 has no interactive transactions so multi-statement writes must be `batch()`.

## Sources

- https://tanstack.com/start/latest/docs/framework/react/guide/hosting
- https://raw.githubusercontent.com/TanStack/router/main/docs/start/framework/react/guide/server-functions.md
- https://raw.githubusercontent.com/TanStack/router/main/docs/start/framework/react/guide/middleware.md
- https://raw.githubusercontent.com/TanStack/router/main/packages/start-client-core/src/createServerFn.ts
- https://raw.githubusercontent.com/TanStack/router/main/packages/start-client-core/src/createMiddleware.ts
- https://nitro.build/examples/vite-ssr-tss-react
- https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack/
- https://developers.cloudflare.com/workers/vite-plugin/get-started/
- https://developers.cloudflare.com/workers/vite-plugin/reference/api/
- https://developers.cloudflare.com/workers/vite-plugin/reference/vite-environments/
- https://developers.cloudflare.com/workers/vite-plugin/reference/static-assets/
- https://developers.cloudflare.com/workers/vite-plugin/reference/secrets/
- https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/workers/static-assets/binding/
- https://developers.cloudflare.com/workers/testing/vitest-integration/get-started/write-your-first-test/
- https://developers.cloudflare.com/workers/testing/vitest-integration/configuration/
- https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/
- https://developers.cloudflare.com/workers/testing/vitest-integration/isolation-and-concurrency/
- https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/
- https://developers.cloudflare.com/workers/testing/vitest-integration/migration-guides/migrate-to-vitest-plugin/
- https://developers.cloudflare.com/workers/testing/vitest-integration/migration-guides/migrate-from-vitest-3-to-vitest-4/
- https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-plugin-examples/d1
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://vitest.dev/guide/projects
- https://orm.drizzle.team/docs/connect-cloudflare-d1
- https://orm.drizzle.team/docs/get-started/d1-new
- https://orm.drizzle.team/docs/guides/d1-http-with-drizzle-kit
- https://github.com/drizzle-team/drizzle-orm/issues/758
- https://github.com/drizzle-team/drizzle-orm/issues/2463
- https://www.better-auth.com/docs/adapters/drizzle
- https://www.better-auth.com/blog/1-5
- https://www.better-auth.com/docs/plugins/admin
- https://www.better-auth.com/docs/concepts/api
- https://www.better-auth.com/docs/reference/options
- https://www.better-auth.com/docs/plugins/magic-link
- https://www.better-auth.com/docs/plugins/organization
- https://github.com/better-auth/better-auth/discussions/7963
- npm registry (`npm view <pkg> version peerDependencies time`) for section 8
