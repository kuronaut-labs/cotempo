---
id: 10
title: "API endpoint design: server functions vs server routes"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: [4]
---

## Question

Now that the stack (TanStack Start full-stack) and data model (#4) are locked, how should the API surface be structured?

1. **Server functions vs server routes** — TanStack Start offers `createServerFn` (typed RPC, the primary primitive) and server routes (traditional REST endpoints). Which operations use which? CRUD for intervals, jobs, clients, workers? Reporting/billing queries? Auth-protected operations?
2. **Middleware chain** — what middleware runs before server functions? Auth verification, role checking, request validation. How does this compose with BetterAuth's session middleware?
3. **Validation** — Zod schemas for inputs? Shared between client and server?
4. **Public vs protected** — are any endpoints public (e.g. health check), or is everything behind auth? How are server functions secured by default?
5. **Pagination & filtering** — how are list queries (intervals by worker/period, jobs by client) paginated and filtered?

## Context

- Stack from #3: TanStack Start + Cloudflare D1 + Drizzle + BetterAuth on Cloudflare Workers.
- Data model from #4: workers (base+extensions), clients, projects, jobs, intervals.
- Research #1 noted: Start's mental model is "server functions are the security boundary, not `beforeLoad`" — easy to get wrong.
- `src/start.ts` footgun: defining it for auth middleware drops auto-CSRF — must re-add `createCsrfMiddleware()`.
- Roles from #5 (not yet resolved) will inform the role-checking middleware pattern.

## Resolution

Closed by wayfinder after grilling with user. All five sub-questions confirmed against the recommended options.

### API surface shape

- **Server functions (`createServerFn`)** — the primary primitive for all UI-driven operations: CRUD on workers, clients, projects, jobs, intervals; reporting queries (per-client billable, per-worker utilization, reconciliation); billing/admin reads. Mutations use `POST`, queries use `GET`.
- **Server routes** — reserved for `/api/health` (public, for monitoring) and any future cross-origin / webhook consumers (none in v1).
- **`/api/health`** — the only public endpoint; returns `{ status: 'ok', version: ... }`. Used by Cloudflare uptime monitoring.

### Middleware composition

- **Global (src/start.ts → requestMiddleware):**
  - `createCsrfMiddleware()` — explicitly re-added; defining `start.ts` for any reason silently drops auto-CSRF.
  - BetterAuth session loader — populates a `user` slot on context from the session cookie (or null).
- **Per-server-function (.middleware([...])):**
  - `authMiddleware` — throws if no session; populates typed `{ user, role, supervisor_id }` context (loaded from human_workers per #8).
  - `roleGuard(['admin', 'billing'])` — applied explicitly to functions that require elevated roles; throws on mismatch.
  - `superviseeOnly` — applied to time-entry functions per #5's hard authorization boundary (operators only enter/edit time for themselves or their supervisees).

### Validation

- **Shared Zod schemas** in `src/lib/schemas/` — one source of truth for every input shape (interval create/edit, worker create, job create, pagination cursor, etc.).
- `.validator(schema)` on every server function — server-side enforcement.
- Client uses the same schemas for form validation (`@tanstack/react-form` + Zod resolver).
- Errors: Zod validation failures → typed error with field-level details.

### Pagination & filtering

- **Cursor-based** pagination for all list queries (intervals by worker/period, jobs by client).
- Search params validated by Zod (`{ cursor?: string, limit?: number, ...filters }`).
- Drizzle queries use `WHERE id < cursor ORDER BY id DESC LIMIT N` (or timestamp-based for intervals).
- Default page size: 50. Max: 200.

### Conventions for build

- Server functions live in `src/server/fns/` (one file per resource: `intervals.ts`, `jobs.ts`, `workers.ts`, `clients.ts`, `reports.ts`).
- Server routes in `src/routes/api/` (only `health.ts` in v1).
- Schemas in `src/lib/schemas/`.
- Middleware in `src/server/middleware/`.

### Implications

- No new tickets surfaced. The build now has a clear API convention to follow.
- `reports.ts` is the home for the four v1 report shapes from #7 — to be prototyped as part of #11.
- No impact on #11 (reporting) or #12 (approval).

## Status

Closed. Recorded on map as Decision #10.