import { createFileRoute } from '@tanstack/react-router'
import { Users } from 'reicon-react'
import { StatusChip } from '~/components/ui/chip'
import { STATUS_LABEL } from '~/components/weekStatus'
import { formatWeekLabel } from '~/lib/dayMath'
import { formatHmm } from '~/lib/money'
import { listTeamWeeksFn } from '~/server/fns/approvals'
import type { TeamMember } from '~/server/services/approvals'

type WeekStatus = TeamMember['weeks'][number]['status']

const badgeKind: Record<WeekStatus, 'solid' | 'outline' | 'inverse' | 'error'> = {
  none: 'outline',
  draft: 'outline',
  submitted: 'inverse',
  approved: 'solid',
  rejected: 'error',
}

export const Route = createFileRoute('/_app/team')({
  loader: () => listTeamWeeksFn({ data: { weeks: 4 } }),
  component: TeamPage,
})

function TeamPage() {
  const team = Route.useLoaderData() as TeamMember[]
  if (team.length === 0) {
    return (
      <main className="leave">
        <h1><Users size={18} /> Team</h1>
        <p className="tree-empty">No team members yet.</p>
      </main>
    )
  }
  return (
    <main className="leave">
      <h1><Users size={18} /> Team</h1>
      {team.map((m) => (
        <section key={m.workerId} className="card">
          <h2>{m.workerName}</h2>
          <table className="intervallist">
            <thead>
              <tr>
                <th>Week</th>
                <th>Status</th>
                <th>Wall clock</th>
                <th>Effort</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {m.weeks.map((w) => (
                <tr key={w.weekStart}>
                  <td className="mono">{formatWeekLabel(w.weekStart)}</td>
                  <td><StatusChip kind={badgeKind[w.status]}>{STATUS_LABEL[w.status]}</StatusChip></td>
                  <td className="mono">{formatHmm(w.wallClockMin)}</td>
                  <td className="mono">{formatHmm(w.effortMin)}</td>
                  <td className="mono">{w.flagCount > 0 ? `⚑ ${w.flagCount}` : 'no flags'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </main>
  )
}
