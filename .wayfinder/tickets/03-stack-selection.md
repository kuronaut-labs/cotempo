---
id: 3
title: "Stack selection: frontend framework and backend architecture"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: [1]
---

## Question

Given the research on Astro vs TanStack Start (ticket #1), which framework do we use, and what's the backend architecture?

Decide:
1. **Frontend framework** — Astro or TanStack Start? Why, given the app's needs (protected API, auth, data CRUD, single-org, modern UX)?
2. **Architecture** — full-stack (framework serves both frontend and API) or separated (frontend + dedicated backend)? What are the tradeoffs for this app specifically?
3. **Backend** — if separated, what backend (language, framework, runtime)? If full-stack, does the framework's built-in server suffice for protected endpoints?
4. **Database** — what database and ORM? (Postgres/SQLite/etc., Drizzle/Prisma/etc.)

Constraints from standing decisions: web-based, not Next.js, must support protected API endpoints, single-org.

## Resolution

**Decision: TanStack Start + Cloudflare D1 + Drizzle ORM + BetterAuth, deployed on Cloudflare Workers.**

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend framework | **TanStack Start** (React) | App-like UX (data entry, timelines, dashboards) is its home turf. Route-tree-first, type-safe data stack, TanStack Query integration. User confirmed React commitment. |
| Architecture | **Full-stack** (TanStack Start serves frontend + API) | Server functions + server routes provide protected API endpoints in one codebase. No separate backend needed. |
| Database | **Cloudflare D1** (SQLite-at-edge) | Cost-conscious, user familiar with Cloudflare, native to Workers, practically free for single-org at start. Overlap math in app code / standard SQL. Can migrate to Postgres later if reporting outgrows SQLite. |
| ORM | **Drizzle** | Native to D1, Cloudflare-native, TypeScript-first, lightweight. 2026 default for edge/serverless. |
| Auth | **BetterAuth** (https://better-auth.com) | Framework-agnostic, works with TanStack Start. Handles sessions, OAuth, RBAC. User's choice. Pre-resolves most of ticket #8. |
| Deployment | **Cloudflare Workers** (via Nitro presets) | User familiar with Cloudflare. Not Vercel. TanStack Start has Cloudflare as official partner. Cost-effective for single-org. |

**Tradeoffs accepted:**
- D1/SQLite lacks Postgres-native interval types and `EXCLUDE USING gist` overlap constraints. Overlap detection and attribution computed in app code or standard SQL queries. Acceptable for single-org scale; migration to Postgres via Hyperdrive remains a future option.
- TanStack Start v1.0 stable mid-2026 — newer ecosystem, smaller community than Astro. Pin versions, read release notes.
- `src/start.ts` footgun: defining it for auth middleware drops auto-CSRF — must re-add `createCsrfMiddleware()` explicitly.
