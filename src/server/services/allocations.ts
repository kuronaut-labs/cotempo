import { inArray } from 'drizzle-orm'
import { effectiveJobIds, pace, type Pace } from '~/lib/allocation'
import { localDateOf } from '~/lib/dayMath'
import { recon as piecesRecon } from '~/lib/attribution'
import { loadPieces } from './reports'
import { listAssignments } from './assignments'
import { listStructure } from './structure'
import type { Deps } from './deps'
import type { SessionContext } from '~/server/context'
import { schema } from '~/server/db'

export type AllocationRow = {
  assignmentId: string
  workerId: string
  workerName: string
  workerKind: 'human' | 'agent'
  targetKind: 'project' | 'job'
  targetId: string
  targetName: string
  clientName: string
  dueOn: string | null
  allocatedMinutes: number | null
  loggedMinutes: number
  remainingMinutes: number | null
  pace: Pace
}

/** Time-only roll-up of what each person is burning against their assignments (#18). */
export async function allocationReport(deps: Deps, ctx: SessionContext, input: { workerId?: string }): Promise<AllocationRow[]> {
  const rows = await listAssignments(deps, ctx, { workerId: input.workerId })
  if (rows.length === 0) return []
  const structure = await listStructure(deps, ctx, { includeArchived: true })

  const kinds = await deps.db
    .select({ workerId: schema.workers.id, kind: schema.workers.kind })
    .from(schema.workers)
    .where(inArray(schema.workers.id, rows.map((r) => r.workerId)))
    .all()
  const kindBy = new Map(kinds.map((k) => [k.workerId, k.kind]))

  const clientNames = new Map(
    structure.map((c) => [c.id, c.name]),
  )

  const out: AllocationRow[] = []
  for (const a of rows) {
    const jobIds = [...effectiveJobIds([a], structure)]
    let loggedMinutes = 0
    if (jobIds.length > 0) {
      const pieces = await loadPieces(
        deps,
        { from: '2000-01-01', to: '2100-01-01' },
        { workerIds: [a.workerId], jobIds },
      )
      // Pick wallClockMin explicitly — never spread a Recon (money never crosses, #18).
      loggedMinutes = piecesRecon(pieces).wallClockMin
    }
    out.push({
      assignmentId: a.id,
      workerId: a.workerId,
      workerName: a.workerName,
      workerKind: kindBy.get(a.workerId) === 'agent' ? 'agent' : 'human',
      targetKind: a.targetKind,
      targetId: a.targetId,
      targetName: a.targetName,
      clientName: clientNames.get(a.clientId) ?? '?',
      dueOn: a.dueOn,
      allocatedMinutes: a.allocatedMinutes,
      loggedMinutes,
      remainingMinutes: a.allocatedMinutes == null ? null : a.allocatedMinutes - loggedMinutes,
      pace: pace(
        a.allocatedMinutes,
        loggedMinutes,
        localDateOf(a.createdAt.getTime(), deps.tz),
        a.dueOn,
        localDateOf(deps.now().getTime(), deps.tz),
      ),
    })
  }
  return out
}
