import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { FileDownload } from 'reicon-react'
import { KpiTile } from '~/components/kpiTile'
import { ManageCard } from '~/components/manageCard'
import { PeriodSelector } from '~/components/periodSelector'
import { StatusChip } from '~/components/ui/chip'
import { TrioChip } from '~/components/trioChip'
import { Button } from '~/components/ui/button'
import { exportCsvFn } from '~/server/fns/exports'
import { formatCents, formatHmm } from '~/lib/money'
import { formatWeekLabel } from '~/lib/dayMath'
import { getTodayFn } from '~/server/fns/intervals'
import { getProjectFn, projectFiguresFn } from '~/server/fns/projects'
import { getSessionCtxFn } from '~/server/fns/auth'

const searchSchema = z.object({ from: z.string().optional(), to: z.string().optional() })

export const Route = createFileRoute('/_app/projects/$projectId')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ from: search.from ?? '', to: search.to ?? '' }),
  loader: async ({ params, deps }) => {
    const [detail, figures, today, ctx] = await Promise.all([
      getProjectFn({ data: { id: params.projectId } }),
      projectFiguresFn({
        data: { id: params.projectId, from: deps.from || undefined, to: deps.to || undefined },
      }),
      getTodayFn(),
      getSessionCtxFn(),
    ])
    return {
      detail,
      figures,
      today,
      from: deps.from,
      to: deps.to,
      isAdmin: ctx?.roles.includes('admin') ?? false,
      canExport: Boolean(ctx && (ctx.roles.includes('admin') || ctx.roles.includes('billing'))),
    }
  },
  onError: () => {
    throw notFound()
  },
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const router = useRouter()
  const navigate = Route.useNavigate()
  const { detail, figures, today, from, to, isAdmin, canExport } = Route.useLoaderData()
  const period = { from: from ?? '2000-01-01', to: to ?? '2100-01-01' }
  const allTime = figures.allTime
  const showMoney = 'cents' in allTime
  const budget =
    figures.budgetCents != null && figures.consumedCents != null
      ? figures.consumedCents >= figures.budgetCents
        ? 'used up'
        : `${Math.round((figures.consumedCents / figures.budgetCents) * 100)}%`
      : null
  const refresh = () => router.invalidate()
  const setPeriod = (p: { from: string; to: string }) =>
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, from: p.from, to: p.to }) })
  return (
    <main className="detail">
      <nav className="crumbs">
        <Link to="/projects">Projects</Link> /{' '}
        <Link to="/clients/$clientId" params={{ clientId: detail.clientId }}>
          {detail.clientName}
        </Link>{' '}
        / <span>{detail.name}</span>
      </nav>
      <header className="admin-head">
        <h1>{detail.name}</h1>
        <StatusChip kind={detail.archivedAt ? 'error' : 'success'}>{detail.archivedAt ? 'Archived' : 'Live'}</StatusChip>
      </header>
      {from || to ? (
        <PeriodSelector from={period.from} to={period.to} today={today.date} tz={today.tz} onChange={setPeriod} />
      ) : null}
      <div className="kpirow">
        <KpiTile label="Effort" value={formatHmm(allTime.effortMin)} />
        <KpiTile label="Wall clock" value={formatHmm(allTime.wallClockMin)} />
        <KpiTile label="Overtime" value={figures.overtimeMin > 0 ? formatHmm(figures.overtimeMin) : '—'} />
        {showMoney ? <KpiTile label="Billable" value={formatCents(allTime.cents)} /> : null}
        {budget ? (
          <KpiTile
            label="Budget used"
            value={budget}
            hint={figures.budgetCents != null ? formatCents(figures.budgetCents) : undefined}
          />
        ) : null}
        <KpiTile label="Jobs" value={`${detail.jobs.filter((j) => !j.archivedAt).length}`} hint={`of ${detail.jobs.length}`} />
        {detail.dueOn ? <KpiTile label="Due" value={detail.dueOn} /> : null}
      </div>
      <div className="detail-grid">
        <section className="card">
          <div className="card-head">
            <h2>Trio</h2>
            {canExport && (
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  const res = await exportCsvFn({ data: { from: period.from, to: period.to, view: 'intervals', projectId: detail.id } })
                  const blob = await res.blob()
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `timesheets-${period.from}_${period.to}-${detail.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
                  document.body.appendChild(a)
                  a.click()
                  a.remove()
                  URL.revokeObjectURL(url)
                }}
              >
                <FileDownload size={13} /> Export CSV
              </Button>
            )}
          </div>
          <TrioChip recon={allTime} size="lg" />
        </section>
        <section className="card">
          <div className="card-head"><h2>Jobs</h2></div>
          <table className="recontable">
            <thead><tr><th>Job</th><th>Effort</th>{showMoney ? <th>Rate</th> : null}</tr></thead>
            <tbody>
              {figures.byJob.map((j) => (
                <tr key={j.jobId}>
                  <td>
                    {j.jobName}
                    {j.archivedAt ? <StatusChip kind="muted">archived</StatusChip> : null}
                  </td>
                  <td className="mono">{formatHmm(j.period.effortMin)}</td>
                  {showMoney ? (
                    <td className="mono">
                      {'billableRateCents' in j && j.billableRateCents != null
                        ? `${formatCents(j.billableRateCents)}/h`
                        : '—'}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <section className="card">
        <div className="card-head"><h2>People</h2></div>
        <table className="recontable">
          <thead><tr><th>Worker</th><th>Effort</th><th>Overlap</th><th>Overtime</th></tr></thead>
          <tbody>
            {figures.byWorker.map((w) => (
              <tr key={w.workerId}>
                <td>{w.name}{w.kind === 'agent' ? ' (agent)' : ''}</td>
                <td className="mono">{formatHmm(w.period.effortMin)}</td>
                <td className="mono">+{formatHmm(w.period.premiumMin)}</td>
                <td className="mono">{w.overtimeMin > 0 ? formatHmm(w.overtimeMin) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {figures.assigned && figures.assigned.length > 0 ? (
          <ul className="assignmentsstrip ul">
            {figures.assigned.map((a) => (
              <li key={a.workerId}>
                <span className="dot" /> {a.name} · {a.allocatedMinutes != null ? formatHmm(a.allocatedMinutes) : 'no cap'}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <section className="card">
        <div className="card-head"><h2>Weekly</h2></div>
        <table className="recontable">
          <thead><tr><th>Week</th><th>On the clock</th><th>Total of entries</th><th>Overlap</th></tr></thead>
          <tbody>
            {figures.weeks.map((w) => (
              <tr key={w.weekStart}>
                <td className="mono">{formatWeekLabel(w.weekStart)}</td>
                <td className="mono">{formatHmm(w.recon.wallClockMin)}</td>
                <td className="mono">{formatHmm(w.recon.effortMin)}</td>
                <td className="mono">+{formatHmm(w.recon.premiumMin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <div className="card-head"><h2>Recent entries</h2></div>
        <table className="recontable">
          <thead><tr><th>When</th><th>Worker</th><th>Job</th></tr></thead>
          <tbody>
            {figures.recent.map((r) => (
              <tr key={r.id}>
                <td className="mono">{String(r.startedAt).slice(0, 10)}</td>
                <td>{r.workerName}</td>
                <td>{r.jobName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {isAdmin && (
        <ManageCard
          kind="project"
          id={detail.id}
          name={detail.name}
          archivedAt={detail.archivedAt}
          refresh={refresh}
        />
      )}
    </main>
  )
}
