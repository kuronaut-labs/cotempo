/* Allocation maths for assignments (Stage 3, #20): src/lib never imports ~/server. */

type Structure = { projects: { id: string; jobs: { id: string; archivedAt: Date | null }[] }[] }[]

export type Pace = 'ahead' | 'on_track' | 'behind' | 'over' | 'n/a'

const DAY_MS = 86_400_000
const isoDays = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / DAY_MS)

/** Linear burn from the assignment's creation day to its due date. (#allocation) */
export function pace(
  allocatedMinutes: number | null,
  loggedMinutes: number,
  startIso: string,
  dueOn: string | null,
  todayIso: string,
  tolerance = 0.1,
): Pace {
  if (allocatedMinutes == null || dueOn == null) return 'n/a'
  const total = isoDays(dueOn, startIso)
  if (total <= 0) return 'n/a'
  if (loggedMinutes > allocatedMinutes) return 'over'
  const elapsed = isoDays(todayIso, startIso)
  const expected = allocatedMinutes * Math.min(1, Math.max(0, elapsed / total))
  const slack = tolerance * allocatedMinutes
  if (loggedMinutes < expected - slack) return 'behind'
  if (loggedMinutes > expected + slack) return 'ahead'
  return 'on_track'
}

/** Project assignment → its live jobs; job assignment → itself. Union dedupes. */
export function effectiveJobIds(
  assignments: { targetKind: 'project' | 'job'; targetId: string }[],
  structure: Structure,
): Set<string> {
  const out = new Set<string>()
  for (const a of assignments) {
    if (a.targetKind === 'job') {
      out.add(a.targetId)
      continue
    }
    for (const p of structure) {
      for (const prj of p.projects) {
        if (prj.id !== a.targetId) continue
        for (const j of prj.jobs) if (!j.archivedAt) out.add(j.id)
      }
    }
  }
  return out
}
