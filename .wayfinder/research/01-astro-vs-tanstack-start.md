# Research: Astro vs TanStack Start (2026)

**Purpose:** Structured, side-by-side comparison for a single-org web application with protected API endpoints. No recommendation — facts and tradeoffs only. Next.js is explicitly out of scope.

**Versions researched:** Astro 7.x (current), TanStack Start v1.0 stable / RC (current as of mid-2026).
**Date of research:** August 30, 2026.

> Both frameworks are full-stack capable and can serve frontend + protected API from one codebase. The difference is **what each optimizes for** and **where the security boundary lives**.

---

## 1. Protected / Authenticated API Endpoints

### Astro

- **Server endpoints (API routes):** Files in `src/pages/api/*.ts` export HTTP-method functions (`GET`, `POST`, etc.) typed as `APIRoute`. They receive an `APIContext` with `params`, `request`, `cookies`, `redirect`, `locals`, `url`. Use web-standard `Request`/`Response` (Fetch API) — no Express-style `req`/`res`. Dynamic routes via `[id].ts` work both SSG (`getStaticPaths`) and SSR.
- **Middleware:** `src/middleware.ts` exports `onRequest(context, next)`. Runs for all on-demand rendered pages/endpoints. Shares per-request data via `context.locals` (typed via `declare namespace App.Locals`). Chain with `sequence(a, b, c)`. Supports `context.rewrite()` and `next(path)` for in-place rewrites.
- **Auth gating patterns:**
  - Per-endpoint: read `context.locals.user` (set by middleware) inside each handler; throw `ActionError({ code: 'UNAUTHORIZED' })` for actions, or return `new Response(..., { status: 401 })` for raw endpoints.
  - Middleware-level: `getActionContext()` lets middleware inspect inbound action requests and reject before the handler runs (`action?.calledFrom === 'rpc'` then check session cookie).
  - **Astro 7 new — `src/fetch.ts`:** Exports the standard Cloudflare/Deno/Bun `fetch` handler pattern. Lets you compose the entire request pipeline (i18n, auth, actions, middleware, pages, cache) in the order you choose, or proxy `/api` to another service. This is the cleanest place for an auth gate that runs *before* Astro Actions — historically a pain point.
- **Maturity:** Server endpoints stable since v2 (2023); middleware stable since v3; Actions stable since v5; `fetch.ts` pipeline control shipped in Astro 7 (June 2026). Well-trodden territory.

### TanStack Start

- **Server routes (API routes):** Real backend endpoints alongside the frontend. For external/cross-origin/public API consumers.
- **Server functions (`createServerFn`):** The primary primitive. Type-safe RPCs invoked directly from client code, loaders, or other server functions. **Important:** server functions are same-origin RPC endpoints reachable by direct HTTP POST independent of which route rendered the UI. The docs are explicit: *"`beforeLoad` is for route UX — it is not the data boundary."*
- **Middleware:** `createMiddleware({ type: 'function' }).server(async ({ next }) => ...)`. Composes via `.middleware([authMiddleware, adminMiddleware])` on each server function. Context is **fully typed through inference** — passing `{ user }` downstream gives downstream handlers the exact type with no manual annotations. This is one of Start's headline advantages.
- **Auth gating patterns:**
  - Per-function: attach `authMiddleware` (reads session cookie via `getRequestHeader('cookie')`, looks up session in DB, throws `Unauthorized`) to every protected `createServerFn`.
  - Composed middleware: layer `adminMiddleware` on top of `authMiddleware` for role checks; context carries the authenticated user through.
  - Global: `src/start.ts` → `createStart(() => ({ requestMiddleware: [...] }))` runs on every request (CSRF, logging, etc.).
- **CSRF:** Built-in `createCsrfMiddleware()` protects server functions via Fetch Metadata / `Origin` / `Referer` checks. **Auto-installed if you don't define `src/start.ts`** — but if you do define it (e.g. to add auth middleware), you must add the CSRF middleware explicitly or you silently lose that protection.
- **Maturity:** v1.0 stable as of mid-2026 ("production-ready, ship real SaaS on it"). Newer than Astro's server story; expect a faster-moving API and smaller community.

**Side-by-side:**

| Concern | Astro | TanStack Start |
|---|---|---|
| Server endpoint primitive | `APIRoute` file in `src/pages/api/` | Server routes + `createServerFn` |
| Type-safe RPC (no manual fetch) | Astro Actions (`astro:actions`) | Server functions (primary) |
| Middleware | `src/middleware.ts`, `sequence()`, `locals` | `createMiddleware().server()`, inferred typed context |
| Run auth *before* actions | Astro 7 `src/fetch.ts` pipeline; or `getActionContext()` in middleware | Global `requestMiddleware` in `src/start.ts` |
| CSRF protection | Manual (cookie flags + origin checks) | Built-in `createCsrfMiddleware()` (auto unless you override `start.ts`) |
| Pipeline control | Astro 7 `fetch.ts` / `astro/hono` handlers — full ordering | `src/start.ts` `requestMiddleware` array |

---

## 2. Auth Integration Patterns

### Astro

- **Built-in:** Sessions API (`astro:session` / Session Driver API) — pluggable session storage drivers (file, redis, memcached, netlify blob, etc.). Cookie helpers on `APIContext.cookies`. **No first-party auth provider.**
- **DIY is the default:** Roll your own session cookies (`HttpOnly`, `Secure`, `SameSite`, `__Host-` prefix), password hashing, OAuth state+PKCE flows inside Actions or endpoints.
- **Ecosystem integrations:** Auth.js / NextAuth-style adapters are community-maintained and less mature than the Next.js equivalents. Clerk, WorkOS, Better Auth, Supabase Auth, Lucia, Stytch all have Astro guides/integrations but are not deep first-party integrations. Auth0 has community adapters.
- **Astro DB / Studio DB** (powered by Drizzle) provides a hosted option but is scoped to Astro's platform.
- **Cookie/session story:** `context.cookies.set/get/delete` with full attribute control. Sessions persist across requests via the Session Driver layer (not just `locals`, which dies with the request).

### TanStack Start

- **Built-in:** `useSession` from `@tanstack/react-start/server` for HTTP-only cookie sessions. `getRequestHeader` / `setResponseHeader` primitives for manual cookie control. The docs ship a full **Authentication Server Primitives** guide covering session cookies, session lookup as middleware, login/logout, OAuth state+PKCE, password-reset enumeration defense, CSRF, rate limiting, and session rotation — with explicit WRONG/CORRECT patterns.
- **DIY is well-supported and documented** but the auth logic itself is yours. The framework provides the *primitives* (cookies, middleware, typed context, sessions); it does not provide a user store, OAuth client, or MFA.
- **Managed provider SDKs (first-class):**
  - **WorkOS** ships `@workos/authkit-tanstack-react-start` with `authkitMiddleware()` designed for `src/start.ts`. Documented as "dedicated TanStack Start SDK… not adapted as an afterthought."
  - **Clerk** has a dedicated TanStack Start integration.
  - **Better Auth** (OSS) is recommended in the official auth overview.
- **Mental model difference:** TanStack Start is emphatic that **server functions are the security boundary, not routes**. `beforeLoad` guards protect the page experience only; every protected server function must enforce auth in its handler or middleware. This is the single most common auth mistake in Start apps.

**Side-by-side:**

| Concern | Astro | TanStack Start |
|---|---|---|
| Session storage abstraction | Session Driver API (pluggable backends) | `useSession` (cookie-based); bring your own DB session table |
| Cookie primitives | `context.cookies.*` | `getRequestHeader` / `setResponseHeader` |
| Official auth guide | Authentication guide (lighter) | Full Server Primitives guide with OWASP-aligned patterns |
| Managed providers | Clerk/WorkOS/Better Auth via community guides | WorkOS & Clerk with dedicated SDKs; Better Auth recommended |
| Where auth lives | Middleware + per-action/endpoint check | Per-server-function middleware (the security boundary) |

---

## 3. Data Fetching and Mutation

### Astro

- **Fetching (server-rendered pages):** Top-level `await` in `.astro` frontmatter — runs at build or request time, naturally avoids waterfalls. No first-class client-side fetch primitive; you wire `fetch()` inside islands yourself.
- **Mutations — Astro Actions (stable since v5):** `defineAction({ input: zodSchema, handler, accept })` in `src/actions/index.ts`, exported from a `server` object. Call `actions.foo({ ... })` from client islands or `<script>`; returns `{ data, error }` (devalue-serialized — handles Dates, Maps, Sets, URLs). `.orThrow()` variant for direct access.
  - **Progressive enhancement:** Forms can POST to `/_actions/[name]` with zero JS. `Astro.getActionResult()` reads the result server-side after POST/Redirect/GET.
  - **Validation:** Zod is the canonical validator (`astro/zod`).
  - **Errors:** `ActionError({ code: 'UNAUTHORIZED' | 'NOT_FOUND' | ..., message })` with typed `error.code` on the client.
  - **Server-to-server:** Import `actions` directly in API routes/middleware (no HTTP round-trip); `getActionContext()` for inspection.
- **Server endpoints:** Lower-level alternative to Actions — manual `request.json()` / `request.formData()`, manual response serialization.
- **Caching:** Astro 7 introduced Route Caching with explicit control; HTTP headers for on-demand responses.

### TanStack Start

- **Fetching — Route loaders:** TanStack Router's `loader` on each route is the data-loading entry point. Fully type-safe; params and search-params typed end-to-end. Loaders call server functions (or TanStack Query).
- **TanStack Query integration:** First-class. `useSuspenseQuery` enables streaming SSR. The route tree owns path params, search params, preloading, data deps, error states, and the typed bridge into server-only code.
- **Mutations — Server functions:** `createServerFn({ method: 'GET' | 'POST' }).validator(schema).handler(async ({ data }) => ...)`. Called from loaders, components (`useServerFn()`), event handlers, or other server functions.
  - **Validation:** Zod, Valibot, or any schema lib via `.validator()`.
  - **Serialization:** TypeScript enforces serializable input/output at the network boundary (`strict` mode by default; can opt out per-function).
  - **Returns:** Plain serializable values, `Response` for raw/binary, or streamed data. Server functions can also return Server Components (experimental RSC).
  - **Redirects/not-found:** `throw redirect({ to })` / `throw notFound()` — handled automatically when called from route lifecycles.
  - **Progressive enhancement:** `.url` property on server functions works with HTML forms without JS.
- **Static server functions:** Build-time caching for static generation.
- **Streaming:** Built-in typed streaming from server functions to client.

**Side-by-side:**

| Concern | Astro | TanStack Start |
|---|---|---|
| Page-level data | Top-level `await` in frontmatter | Route `loader` (typed, type-inferred) |
| Client cache/revalidation | Bring your own (TanStack Query in islands) | First-class TanStack Query + router preload |
| Mutation primitive | Astro Actions (`defineAction`) | Server functions (`createServerFn`) |
| Validation | Zod (`astro/zod`) | Any schema lib (Zod common) |
| Return serialization | devalue (Dates, Maps, Sets, URLs) | Strict TS serializability checks; Response for raw |
| Progressive enhancement | Form POST to `/_actions/[name]`, `getActionResult()` | `.url` property with HTML forms |
| Streaming | Streaming recipes; Server Islands | Built-in typed streaming from server fns |

---

## 4. Architecture

### Astro

- **Origin:** Content-first / SSG-first. Islands architecture — ships zero-JS HTML by default; interactivity is opt-in per component (React, Vue, Svelte, Solid, Preact, Alpine). Multi-framework; no lock-in to React.
- **Output modes:** `static` (default), `server` (SSR on-demand), `hybrid` (prerender most, opt pages into on-demand). Per-page `export const prerender = false` toggles.
- **Full-stack?** Yes — server endpoints + Actions + middleware + sessions + (Astro 7) full pipeline control via `src/fetch.ts` and Hono integration (`astro/hono`). Can serve frontend and protected API in one project.
- **Optimizes for:** Content-heavy sites (blogs, docs, marketing) *and* increasingly app-like experiences via Server Islands, Actions, and the v7 fetch pipeline. Still ships less JS by default than React-framework alternatives.
- **Content Layer API (v5):** Unified type-safe schema for local files and remote data sources. A real differentiator if the app has any content/CMS surface.
- **Astro 7 highlights:** `src/fetch.ts` standard fetch-handler pattern (Cloudflare/Deno/Bun compatible); Hono-based pipeline composition; route caching; Rust-based Markdown processor (Sätteri) now in core.

### TanStack Start

- **Origin:** App-first / client-first full-stack React. Built on **TanStack Router** (the heart), **Vite or Rsbuild** (bundler), and **Nitro** (server engine). Tanner Linsley's "client-side first full-stack" philosophy.
- **Full-stack?** Yes — server routes, server functions, full-document SSR, streaming, middleware, server/client builds, universal deployment. RSC is experimental (not required).
- **Optimizes for:** Type-safe app-like experiences where URL state, route loaders, and the server boundary are the center of gravity. The route tree *owns* coordination: path params, search params, preloading, data deps, error states, document rendering, and the typed bridge into server-only code.
- **No vendor lock-in:** No proprietary primitives (contrast with Next.js). Nitro provides the deploy-anywhere layer.
- **SPA mode:** Supported (Next.js and Remix don't). Useful if part of the surface is app-like and part is static.
- **React 19 required** for some deployment targets (e.g., Bun).

**Side-by-side:**

| Concern | Astro | TanStack Start |
|---|---|---|
| Mental model | Content-first, islands, zero-JS default | Route-tree-first, type-safe full-stack React |
| UI framework | Multi (React/Vue/Svelte/Solid/Preact/Alpine) | React (and Solid via `@tanstack/solid-start`) |
| Default JS shipped | Minimal (islands opt-in) | Standard React SPA + SSR |
| RSC | No | Experimental (opt-in) |
| Output modes | static / server / hybrid, per-page | SSR / SPA / static server fns |
| Pipeline control | Astro 7 `src/fetch.ts` + Hono | `src/start.ts` `requestMiddleware` |
| Best fit | Content + light interactivity; mixed content/app | App-like experiences, heavy URL state |

---

## 5. Database Integration

Both frameworks are ORM-agnostic — DB access happens in server-side code (endpoints, actions, server functions, middleware). No framework-opinionated DB layer beyond Astro's Studio DB.

**ORM landscape in 2026 (applies to both):**

- **Drizzle** — TypeScript-first, ~7KB, no codegen step, native edge/serverless. **Crossed Prisma in weekly downloads in late 2025.** PlanetScale acquired the Drizzle core team (March 2026). First-class on Cloudflare D1, Neon serverless, Turso, PlanetScale. **Astro DB / Studio DB is built on Drizzle.** Recommended default for serverless/edge deployments.
- **Prisma 7** — Rewritten from Rust to pure TypeScript: bundle 14MB → ~600KB, 3x faster queries, 9x faster cold starts. Still larger than Drizzle. Best-in-class DX, Studio GUI, mature migrations. Known issue: Cloudflare Workers blocks Prisma 7's runtime WASM compilation — downgrade to 6.19.0 on Workers, or use Prisma Accelerate (paid proxy) for edge. MongoDB/SQL Server support where Drizzle doesn't cover.
- **Kysely** — Query-builder (not full ORM); pairs well with Drizzle for raw SQL control.

**Connection patterns:**

- **Serverless / edge (Vercel, Cloudflare, Netlify, Lambda):** Use a PgBouncer-style pooler (Neon, PlanetScale, Supabase, RDS Proxy, PgBouncer) between functions and DB. Drizzle integrates cleanly with all of these via serverless drivers (`@neondatabase/serverless`, `postgres.js`, Cloudflare Hyperdrive / D1). Avoid Prisma on Cloudflare Workers unless on Accelerate.
- **Long-running Node (self-host, Railway, Fly.io, Docker):** Either ORM works; Prisma's internal pool (`connection_limit` in URL) is fine; Drizzle delegates to the driver.
- **Per-request, not module-scope:** TanStack Start's docs explicitly warn that module-scope `process.env` reads are wrong on edge runtimes (env injected at request time) *and* a security risk (can be inlined into client bundles). Read env inside handlers. Astro's `astro:env` provides typed, validated env access with similar guidance.

**Framework-specific:**

- **Astro:** Official "Backend services" guides for Neon, Supabase, Turso, Prisma Postgres, Xata, Firebase, Appwrite. Astro DB (Drizzle-based) for hosted-in-Astro option. DB code lives in endpoints/actions/middleware.
- **TanStack Start:** Recommended file split: `*.functions.ts` (createServerFn wrappers, safe to import anywhere), `*.server.ts` (server-only DB code, only imported inside handlers), `*.ts` (client-safe types/schemas). Build strips server code from client bundles — static imports of server fns in client components are safe (replaced with RPC stubs).

**Side-by-side:**

| Concern | Astro | TanStack Start |
|---|---|---|
| ORM opinion | Agnostic; Astro DB = Drizzle | Agnostic |
| Where DB code runs | Endpoints, actions, middleware | Server fn handlers, `*.server.ts` helpers |
| Server-code isolation | Server endpoints/actions by location | Build-time stripping; `*.server.ts` convention |
| Edge/serverless ORM fit | Drizzle native; Prisma via Accelerate | Drizzle native; Prisma via Accelerate (Workers caveat) |
| Env access | `astro:env` (typed/validated) | `process.env` per-request (warned against module-scope) |

---

## 6. Deployment Story

### Astro

- **Adapters (official):** Node, Cloudflare, Vercel, Netlify. Each generates platform-specific output.
- **Deployment guides exist for:** AWS (incl. SST/Flightcontrol), Azure, Cloudflare, Deno Deploy, Fly.io, GitHub/GitLab Pages, Google Cloud, Heroku, Railway, Render, Vercel, Netlify, Cleavr, Clever Cloud, Fleek, Azion, EdgeOne, Zeabur, Zephyr, Zerops, and many more (~30 documented).
- **Self-host:** First-class via `@astrojs/node` adapter — any Node runtime. Docker recipes provided. Bun supported via recipe.
- **Constraints:** Output mode affects deployment. `static` deploys anywhere (even static hosts). `server`/`hybrid` requires a server runtime via adapter. Astro 7's `src/fetch.ts` aligns with Cloudflare/Deno/Bun fetch-handler conventions, broadening portable deployment.
- **No vendor lock-in.** Mature, broad deployment surface.

### TanStack Start

- **Deploy engine:** Nitro — same deploy-anywhere layer used by Nuxt. Presets for Vercel, Cloudflare Workers, Netlify, AWS Lambda, Node, Bun, Deno Deploy, and more.
- **Official partners:** Cloudflare Workers (official partner), Netlify (official partner), Railway (official partner). Vercel fully supported via Nitro plugin (auto-detected).
- **Self-host:** Node server (`node .output/server/index.mjs`), Docker, Railway, Fly.io, any VPS. Bun runtime supported (React 19 required for Bun preset).
- **Constraints:**
  - Choosing a host mostly means choosing a Nitro preset in `vite.config.ts`. Cloudflare Workers and Netlify have dedicated Vite plugins; others go through Nitro.
  - If you define `src/start.ts` (for auth middleware), **you must re-add `createCsrfMiddleware()`** or lose automatic CSRF protection on server functions.
  - React 19 required for Bun deployment.
- **No vendor lock-in** (explicit design goal). Newer ecosystem → fewer third-party deployment examples than Astro.

**Side-by-side:**

| Concern | Astro | TanStack Start |
|---|---|---|
| Deploy layer | Official adapters per platform | Nitro presets (Vercel/CF/Netlify/Node/Bun/Deno/AWS) |
| Vercel | Official adapter | Via Nitro (auto-detected, Fluid compute) |
| Cloudflare | Official adapter | Official partner, wrangler auto-detects Start |
| Netlify | Official adapter | Official partner |
| Self-host Node | `@astrojs/node` | `node .output/server/index.mjs` |
| Bun | Recipe | Preset (React 19 required) |
| Static hosts | Yes (output: static) | Static server fns / SPA mode |
| Portability | Very broad (~30 documented hosts) | Nitro's full preset matrix; newer community examples |

---

## Key Tradeoffs Summary

**Astro's strengths for this use case**
- Most mature server-endpoint + middleware story (stable since 2023).
- Astro 7's `src/fetch.ts` + Hono pipeline finally lets auth run *before* Actions — removes a historical friction point.
- Multi-framework; not locked into React. Minimal JS by default.
- Broadest deployment surface; well-trodden self-hosting.
- Content Layer API + Server Islands if the app has any content surface.

**Astro's tradeoffs for this use case**
- Auth is largely DIY or via community integrations; no first-party managed-provider SDK as deep as Start's.
- Client-side data fetching/caching is bring-your-own (TanStack Query in islands works but isn't integrated with the router).
- The `.astro` component model is its own thing — teams already fully on React pay a context-switch cost.

**TanStack Start's strengths for this use case**
- The strongest TypeScript inference in the React ecosystem — auth context typed end-to-end through middleware.
- Server-function-as-security-boundary is a clean, defensible mental model (once internalized).
- First-class managed auth SDKs (WorkOS AuthKit, Clerk) designed for Start, not adapted from Next.js.
- Route loaders + TanStack Query + typed server functions form a coherent, type-safe data stack.
- Nitro = genuine deploy-anywhere; no Vercel lock-in.

**TanStack Start's tradeoffs for this use case**
- Younger than Astro's server story; v1.0 stable only in mid-2026. Smaller community, faster-moving API, fewer third-party examples. Pin versions and read release notes.
- The "server functions are the boundary, not `beforeLoad`" model is easy to get wrong — every protected fn needs middleware attached.
- React-only (Solid variant exists but is secondary).
- No RSC by default (experimental) — if RSC is a hard requirement, this is a gap.
- Defining `src/start.ts` silently drops auto-CSRF — a footgun.

---

## Sources

- Astro docs: middleware, endpoints, actions, sessions, deploy guides — https://docs.astro.build
- Astro 7 release blog (fetch.ts pipeline) — https://astro.build/blog/astro-7/
- Astro 6.3 release blog (advanced routing) — https://astro.build/blog/astro-630/
- TanStack Start docs: server-functions, authentication-server-primitives, authentication-overview, hosting — https://tanstack.com/start/latest
- WorkOS: TanStack Start authentication guide (2026) — https://workos.com/blog/tanstack-start-authentication-guide
- WorkOS AuthKit for TanStack Start — https://github.com/workos/authkit-tanstack-start
- Vercel: Deploy a TanStack Start app to Vercel — https://vercel.com/kb/guide/deploy-a-tanstack-start-app-to-vercel
- Vercel: TanStack Start on Vercel — https://vercel.com/docs/frameworks/full-stack/tanstack-start
- Cloudflare: TanStack Start on Workers — https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/
- MakerKit: What Is TanStack Start (2026) — https://makerkit.dev/blog/tutorials/what-is-tanstack-start
- StackNotice: TanStack Start (2026) Full-Stack React Without Next.js — https://stacknotice.com/blog/tanstack-start-complete-guide-2026
- byteiota: TanStack Start v1.0 (2026) — https://byteiota.com/tanstack-start-v1-0-type-safe-react-framework-2026/
- PkgPulse: Drizzle ORM vs Prisma (2026) — https://www.pkgpulse.com/guides/drizzle-orm-vs-prisma-2026
- PkgPulse: Prisma vs Drizzle 2026 — https://www.pkgpulse.com/guides/prisma-vs-drizzle-2026
- buildmvpfast: Drizzle vs Prisma ORM 2026 — https://www.buildmvpfast.com/blog/drizzle-vs-prisma-orm-typescript-nextjs-2026
- Lucky Media: Astro Framework Review 2026 — https://www.luckymedia.dev/insights/astro
