---
id: 25
title: "Client-side form layer: TanStack Form + shared Zod, or hand-rolled state"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: []
---

## Question

#10 locks shared Zod schemas used on both sides, with the client using "`@tanstack/react-form` + Zod resolver". The v1 plan hand-rolls `useState` per field in the login, change-password, and (by extension) entry and admin forms, with no form library and no client-side use of the shared schemas.

Decide:

1. Does #10 stand (TanStack Form with the shared Zod schemas on the client), or is hand-rolled state an accepted revision for v1's small form count?
2. If TanStack Form: which forms use it (all, or only the interval entry form where same-job overlap and end-before-start feedback matter)?
3. How server-side Zod and business errors (`END_BEFORE_START`, same-job overlap, `FORBIDDEN_TARGET`) surface in the form: field-level mapping or a single form-level error?

Output: the form convention for the build and the error-mapping rule. Record as a refinement on #10.

## Resolution

Closed by wayfinder after grilling with user (2026-09-07). All three recommendations accepted. #10 stands; the plan's hand-rolled forms are rejected.

### Convention

- `@tanstack/react-form` on every form, including login and change-password. Validators come from the shared Zod schemas in `src/lib/schemas/`; the same schema runs in the browser and in the server fn's `.validator()`.
- `HttpError` (plan Task 3.2) gains an optional `field?: string`. Server fns set it where a coded error belongs to one input (`END_BEFORE_START` → `endedAt`, `MINUTE_ALIGNMENT` → the offending field, `SAME_JOB_OVERLAP` → `jobId`).
- One client helper, `applyServerError(form, err)`: if `err.field` matches a form field, set that field's error; otherwise set the form-level error. `WEEK_LOCKED`, `FORBIDDEN_TARGET`, and auth failures land form-level.
- BetterAuth client errors pass through the same helper as form-level.

### Implications

- #10 refined: form library confirmed, error contract added.
- Plan Tasks 2.2, 2.3 forms rewritten; `@tanstack/react-form` added; `HttpError` shape extended.
- No new tickets.
