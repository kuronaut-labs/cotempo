---
id: 1
title: "Research: Astro vs TanStack Start for protected APIs, auth, and data"
labels: [wayfinder:research]
status: closed
assignee: wayfinder
blocked-by: []
---

## Question

What are Astro and TanStack Start's respective capabilities for building a single-org web app with protected API endpoints? Surface facts and tradeoffs — do NOT recommend.

Investigate for each framework:
1. **Protected/authenticated API endpoints** — middleware, route protection, server-side endpoint handling
2. **Auth integration patterns** — JWT, session cookies, OAuth; what's built-in vs what you wire yourself
3. **Data fetching and mutation** — server functions, actions, RPC patterns
4. **Architecture** — can it be full-stack (serves API + frontend), or does it expect a separate backend? What does each optimize for?
5. **Database integration** — ORM compatibility, connection patterns
6. **Deployment story** — where does it deploy, what runtimes, any constraints

The answer feeds the stack selection decision (ticket #3).

## Resolution

Research completed. Findings written to [.wayfinder/research/01-astro-vs-tanstack-start.md](../research/01-astro-vs-tanstack-start.md).

**Key findings:**
- Both frameworks are full-stack capable (serve frontend + protected API from one codebase).
- Astro has the more mature server story (endpoints since 2023, middleware, Actions since v5, Astro 7's `src/fetch.ts` + Hono pipeline for pre-Action auth). Content-first, multi-framework, zero-JS-by-default.
- TanStack Start has the most type-safe auth-composition model (`createServerFn` + `createMiddleware` with inferred context), full Server Primitives auth guide, first-party SDKs from WorkOS/Clerk. Route-tree-first, React-only, app-like, SPA mode, experimental RSC. v1.0 stabilized mid-2026.
- Drizzle is the 2026 ORM default for both. Astro has the broadest deployment matrix (~30 hosts); Start uses Nitro presets (Vercel/Cloudflare/Netlify/Node/Bun/Deno/AWS).
- Tradeoff summary: Astro = content-first flexibility + mature middleware; Start = type-safe full-stack app experience + stronger auth primitives.
