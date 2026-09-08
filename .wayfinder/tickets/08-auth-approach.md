---
id: 8
title: "Auth and session approach"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: []
---

## Question

How are users authenticated and authorized in this single-org platform with protected API endpoints?

**Stack is locked (ticket #3):** TanStack Start + Cloudflare Workers + D1 + Drizzle.
**Auth library is locked:** BetterAuth (https://better-auth.com) — framework-agnostic, handles sessions, OAuth, RBAC.

This pre-resolves much of the original question. Remaining decisions:

1. **Auth method** — which providers? BetterAuth supports email/password, OAuth (Google, GitHub, Microsoft, etc.), and magic links. Which combination for this single-org tech-company audience? Password-only, OAuth-only, or both?
2. **API protection pattern** — BetterAuth session validation in TanStack Start server function middleware (the security boundary). Confirm the pattern: `authMiddleware` attached to protected `createServerFn` calls. Note the `src/start.ts` CSRF footgun (must re-add `createCsrfMiddleware()` if defining `start.ts`).
3. **Role enforcement** — how do the roles from ticket #5 map to BetterAuth RBAC + TanStack Start middleware? Per-function role checks or composed middleware layers?
4. **Session storage** — BetterAuth on D1: session table in D1, or cookie-based? What's the pattern for Cloudflare Workers?
5. **Password policy** — if passwords are enabled, what requirements? BetterAuth handles hashing; what complexity rules?

This depends on the roles matrix (ticket #5) being resolved first, since role enforcement depends on knowing the exact roles and permissions.

## Context (post-#5 resolution)

Roles matrix #5 is now closed. Key facts for this ticket:
- **Role model:** every human's `roles` array contains `'operator'` baseline; `'billing'` and `'admin'` additive; admin = superuser. Agents have no roles.
- **Enforcement surface:** supervisee-scoped checks (operator may only enter/edit/view own + supervisor_id subordinates — supervisor_id is a hard authorization boundary), role-gated views (billing view = billing/admin only), structure management (admin only).
- The permissions matrix (role × action) in ticket #5 is the direct input for BetterAuth RBAC plugin permission lists and TanStack Start middleware checks.
- `human_workers.roles` array storage (JSON text vs join table in D1) is an open implementation detail that this ticket should settle alongside BetterAuth's user model linkage (`human_workers.user_id` from #4).

## Resolution

Grilling answers: five recommendations accepted; one deviation — **email invitations** chosen over admin-created accounts.

### Credential model

- **Email + password only.** BetterAuth native flow: scrypt hashing (default), configurable `minLength: 12`. No OAuth, no magic links at v1 — both are additive later with zero migration (BetterAuth plugins).
- **No 2FA at v1.** TOTP plugin is a roadmap add if the org wants it.

### Account creation

- **No public signup endpoint** — signup is disabled; the org boundary is invite-only.
- **Email invitations**: admin sends an invite via the BetterAuth admin plugin invite flow; recipient sets their own password through the link. Email delivery from Workers via an HTTP mail API (Resend or equivalent — implementation detail, resolved at build time; MailChannels' free Workers tier is dead).
- **Bootstrap**: a seed script creates the first admin at deploy (invitations require an existing admin to send them).

### Role enforcement — DB-authoritative, per-request

- `human_workers.roles` (JSON text column, e.g. `["operator","billing"]`) is the **single source of truth** — consistent with the project philosophy. Roles are NOT duplicated onto the BetterAuth user record or baked into sessions.
- Request flow: cookie token → BetterAuth session validation against D1 → join `human_workers` → middleware attaches `{ worker, roles, supervisorId }` to the typed context. Role changes take effect on the next request — no session sync, no invalidation logic.
- **Server functions are the security boundary** (per research #1 — not `beforeLoad`). Pattern: `createMiddleware` auth context loader + guard helpers called inside each server function (`requireRole('billing')`, `requireSupervisorOf(workerId)`, …). Supervisee-scoped checks happen inside function bodies because they depend on the target's `supervisor_id` — composed middleware layers can't express that cleanly.

### Session storage

- **D1 via BetterAuth's drizzleAdapter** — `user`/`account`/`session` tables live in the same D1 database as all app data. One store to back up, migrate, and reason about. Cookie carries only the signed token; every request validates against D1 (edge-local read, fast).
- Roles storage settled: **JSON text column** on `human_workers` (not a join table) — read alongside the worker row, mutated only by admins, ≤3 possible values.

### CSRF footgun (from #3)

If `src/start.ts` is defined (needed for auth middleware), `createCsrfMiddleware()` must be re-added explicitly — defining `start.ts` drops Start's auto-CSRF.

### Rules for non-humans

- **Agents never authenticate.** They are data records (supervised resources), not auth users. All intervals are `entered_by` a human. Agent self-entry is roadmap.

## Status

Closed. Resolution recorded above; map Decisions-so-far updated. Only #6 (entry UX) remains of the original destination six.
