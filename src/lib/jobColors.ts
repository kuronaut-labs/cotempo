/* Global job colour assignment (#UX pass, finding 2): one mapping built from the
   live structure, shared by Today and Reports so a job keeps its colour across pages. */
export function colorIndexFromStructure(structure: { projects: { jobs: { id: string }[] }[] }[]): Record<string, number> {
  const out: Record<string, number> = {}
  let n = 0
  for (const c of structure) for (const p of c.projects) for (const j of p.jobs) out[j.id] = (n++ % 5) + 1
  return out
}
