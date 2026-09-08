---
id: 26
title: "Approval lock enforcement: where the approved-week check lives and what it covers"
labels: [wayfinder:grilling]
status: closed
assignee: wayfinder
blocked-by: [24]
---

## Question

#12 says operators cannot edit intervals inside an approved week, and #17 confirmed the lock binds admin too (unlock first, for everyone). Nothing yet says **where** that check runs or **which operations** it covers. With #20 settling the server-function context shape (session context from middleware, env via `getEnv()`), the question is sharp enough to ticket.

Decide:

1. **Location.** A guard helper called inside every interval mutation (`assertWeekEditable(db, workerId, startedAt)`), a per-fn middleware, or a D1-level trigger? Middleware cannot see the validated body, so the target week is only known in the handler (same reasoning as #8's in-body guards).
2. **Coverage.** Which mutations consult the lock: interval create, edit (times, job, note), soft-delete. Does moving an interval *out of* an approved week into an open one count as editing the approved week? Does creating a new interval *in* an approved week?
3. **Week key derivation.** The lock is keyed by (worker_id, week_start). Which timestamp picks the week: the interval's start, in the org timezone (#7/#23)? What about an interval that crosses the Sunday→Monday boundary?
4. **Status set.** Does `submitted` also lock, or only `approved`? (#12's flow says operator submits then billing approves; editing a submitted-but-unapproved week presumably resets it to draft.)
5. **Error contract.** What the server fn throws (`WEEK_LOCKED` with the week key) and what the entry form shows.

Output: the guard signature, the coverage table, and the week-key rule. Record as a refinement on #12. Blocked by #24 so the `approvals` table shape is final first.

**Update 2026-09-07:** #24 closed; unblocked. Q3 is partly answered by #23: week key = ISO Monday of the interval's start in the org zone, stored as `YYYY-MM-DD`. Remaining: the Sunday→Monday crossing case.

## Resolution

Closed by wayfinder after grilling with user (2026-09-07). All recommendations accepted. Q5 follows #25's error contract.

### Guard

```ts
assertWeeksEditable(db, workerId, ...weekKeys: string[]): Promise<void>
// throws HttpError(409, 'WEEK_LOCKED', { weekStart }) if any key has status 'approved'
```

Called inside every interval mutation handler, after `assertCanEditWorker` (#17). Not middleware, not a trigger.

### Coverage

| Mutation | Weeks checked |
|---|---|
| create | week(start), week(end) if different |
| edit | weeks of the interval **before** the change and **after** it, union |
| soft-delete | week(start), week(end) if different |

Week key = ISO Monday of the instant in the org zone (#23). A Sunday→Monday crossing interval touches two weeks; both must be editable.

### Status semantics

- `approved` is the only lock. Admin unlock (#12) is the only way out.
- `submitted` does not lock. A mutation touching a submitted week flips it to `draft` and writes an `approval_event` (`actor`, `edited_after_submit`), so the approver sees it left the queue.
- `draft`, `rejected`, or no row: editable.

### Error contract

`WEEK_LOCKED` is form-level (#25), message names the week (`Week of 31 Aug is approved. Ask an admin to unlock it.`). Payload carries `weekStart` so the UI can link to the approvals page.

### Implications

- #12 refined: lock = `approved` only; submitted auto-resets to draft; two-week check on crossing intervals.
- #10: `src/server/fns/intervals.ts` mutations all call the guard; approvals fns unchanged.
- Plan: guard lands with interval fns (Phase 4, unwritten).
- No new tickets. Map fog is empty except the Phases 4–8 review.
