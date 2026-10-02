import { addDays, parseIsoDate, toIsoDate } from '~/lib/dateShift'

/* Due-date status for projects and jobs (Stage 3, LD1). Pure string comparison —
   ISO 'YYYY-MM-DD' sorts chronologically lexicographically, so no Date maths on
   local wall time (rule 6). Callers pass `today` explicitly. */

export type DueStatus = 'none' | 'ok' | 'soon' | 'overdue'

export function dueStatus(dueOn: string | null, todayIso: string, soonDays = 7): DueStatus {
  if (!dueOn) return 'none'
  const soonEdge = toIsoDate(addDays(parseIsoDate(todayIso), soonDays))
  if (dueOn < todayIso) return 'overdue'
  if (dueOn <= soonEdge) return 'soon'
  return 'ok'
}

/** A job due after its project is a scheduling smell (#Stage3). Both must be set. */
export function jobDueAfterProject(jobDueOn: string | null, projectDueOn: string | null): boolean {
  return jobDueOn != null && projectDueOn != null && jobDueOn > projectDueOn
}
