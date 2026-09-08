---
id: 16
title: "Invitation flow: recipient-set password link vs emailed temporary password"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: [15]
---

## Question

Ticket #8 locked email invitations where "the recipient sets their own password through the link" via the BetterAuth admin plugin. The v1 plan (Task 2.3) instead creates the user with a random temporary password, emails it in plaintext, and points the recipient at a change-password page. The plan's own file tree still lists an `invite.$token.tsx` route that Task 2.3 never builds.

Decide:

1. Does #8 stand (invite link, recipient sets password), or is the temporary-password flow an accepted revision?
2. If #8 stands, which BetterAuth mechanism carries the token: admin plugin invite, magic link plugin, or the reset-password flow triggered on behalf of a freshly created user? (Research #15 surfaces what each requires.)
3. On mail-send failure, what does the admin see? The plan returns the temporary password to the admin UI as a fallback. Is any fallback acceptable, or must the invite be retried?
4. Token lifetime and single-use semantics.

Output: one paragraph the plan can implement directly, plus a Decisions-so-far line for the map. If the answer revises #8, note that in #8's gist.

## Resolution

Closed by wayfinder after grilling with user (2026-09-07). All four recommendations accepted. **#8 stands; the plan's temporary-password flow is rejected.**

### Flow

Admin invites → invitee receives a link → invitee sets their own password → signs in. No credential ever travels by email or appears in the UI.

### Mechanism: BetterAuth reset-password token, no extra plugin

- `emailAndPassword.disableSignUp: true` — the org boundary stays invite-only.
- **Invite server fn** (admin-only): forwards the calling admin's request headers to `auth.api.createUser` (admin plugin requires an admin session, per research #15) with a random, discarded password; inserts `workers` + `human_workers` rows; then calls `auth.api.requestPasswordReset` (a.k.a. forget-password) for the new email. The configured `sendResetPassword` callback sends the mail via the HTTP mail API.
- **Email template** is context-aware: when the target user has never signed in (no session ever created), the subject/body read as an invitation ("You've been added to Timesheets — set your password"); otherwise it reads as a normal password reset. Both link to the same set-password route.
- **Set-password route** (`/invite/$token` in the plan's tree, or reuse a `/reset-password/$token` route): calls `auth.api.resetPassword` with the token and the chosen password (min 12, per #8), then redirects to login.
- **Token:** single-use, `resetPasswordTokenExpiresIn` = 7 days (604800 s). A Resend issues a fresh token; older tokens are invalidated by BetterAuth's one-use semantics.
- **Bootstrap admin (seed):** no admin session exists yet, so the seed does not use the admin plugin. It hashes the password with BetterAuth's internal context (`(await auth.$context).password.hash`) and inserts `user` + `account` (provider `credential`) + `workers` + `human_workers` rows directly. Demo users in the seed follow the same path.

### Mail failure

The invite persists. `createUser` and the worker rows succeed; only the reset request's send step fails. The workers admin page shows the row with an "invite not delivered" state and a **Resend** action that calls `requestPasswordReset` again. No token, link, or password is ever rendered to the admin. (Delivery state is derived: a human worker with no `account`-level sign-in and no session rows is "pending"; the last send error, if any, is logged server-side and surfaced as a flag.)

### Implications

- **#8:** confirmed as written; refinement recorded: mechanism is the reset-password token flow, 7-day single-use.
- **Plan:** Task 2.3 rewritten (no temp password, no change-password-first-login nudge; the settings/password page stays as a normal feature). Task 2.1's `seed-admin.ts` rewritten to hash-and-insert instead of `createUser`. File tree's `invite.$token.tsx` route is now real.
- **#10:** two new server fns — `inviteUser`, `resendInvite` — both `requireRole('admin')`.
- Env gains `INVITE_TOKEN_TTL_SECONDS` only if made configurable; otherwise the constant lives in the auth config.
- No new tickets surfaced.
