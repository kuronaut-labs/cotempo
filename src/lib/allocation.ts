/* Allocation maths for assignments (Stage 3, #20): src/lib never imports ~/server. */

type Structure = { projects: { id: string; jobs: { id: string; archivedAt: Date | null }[] }[] }[]

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
