import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { KpiTile } from '~/components/kpiTile'
import { ContactsCard } from '~/components/contactsCard'
import { ManageCard } from '~/components/manageCard'
import { PeriodSelector, type Period } from '~/components/periodSelector'
import { StatusChip } from '~/components/ui/chip'
import { TrioChip } from '~/components/trioChip'
import { Button } from '~/components/ui/button'
import { FileDownload } from 'reicon-react'
import { exportCsvFn } from '~/server/fns/exports'
import { formatHmm, formatCents } from '~/lib/money'
import { formatWeekLabel } from '~/lib/dayMath'
import { getClientFn, getClientFiguresFn, type ClientDetail } from '~/server/fns/clients'
import { getTodayFn } from '~/server/fns/intervals'
import { getSessionCtxFn } from '~/server/fns/auth'

const searchSchema = z.object({ from: z.string().optional(), to: z.string().optional() })

export const Route = createFileRoute('/_app/clients/$clientId')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ from: search.from ?? '', to: search.to ?? '' }),
  loader: async ({ params, deps }) => {
    const [detail, figures, today, ctx] = await Promise.all([
      getClientFn({ data: { id: params.clientId } }),
      getClientFiguresFn({ data: { id: params.clientId, from: deps.from || undefined, to: deps.to || undefined } }),
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
  component: ClientDetailPage,
})

function ClientDetailPage() {
  const router = useRouter()
  const navigate = Route.useNavigate()
  const { detail, figures, today, from, to, isAdmin, canExport } = Route.useLoaderData()
  const period = { from: from ?? '2000-01-01', to: to ?? '2100-01-01' }
  const allTime = figures.allTime
  const showMoney = 'cents' in allTime
  const hasPeriod = Boolean(from || to)
  const refresh = () => router.invalidate()
  const setPeriod = (p: Period) =>
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, from: p.from, to: p.to }) })
  return (
    <main className="detail">
      <nav className="crumbs">
        <Link to="/clients">Clients</Link> / <span>{detail.name}</span>
      </nav>
      <header className="admin-head">
        <h1>{detail.name}</h1>
        <StatusChip kind={detail.archivedAt ? 'error' : 'success'}>{detail.archivedAt ? 'Archived' : 'Live'}</StatusChip>
      </header>
      {detail.archivedAt ? <p className="status-msg">Archived on {String(detail.archivedAt).slice(0, 10)}</p> : null}
      {hasPeriod && <PeriodSelector from={period.from} to={period.to} today={today.date} tz={today.tz} onChange={setPeriod} />}
      <div className="kpirow">
        <KpiTile label="Effort" value={formatHmm(allTime.effortMin)} />
        <KpiTile label="Wall clock" value={formatHmm(allTime.wallClockMin)} />
        {showMoney ? <KpiTile label="Billable" value={formatCents(allTime.cents)} /> : null}
        <KpiTile label="Overlap" value={`+${formatHmm(allTime.premiumMin)}`} />
        <KpiTile label="Projects" value={`${detail.projects.filter((p) => !p.archivedAt).length}`} hint={`of ${detail.projects.length} total`} />
        <KpiTile label="Last activity" value={detail.lastActivityMs ? new Date(detail.lastActivityMs).toISOString().slice(0, 10) : '—'} />
      </div>
      {showMoney ? (
        <p>
          <a className="btn btn--secondary" href={`/invoice?clientId=${detail.id}&from=${period.from}&to=${period.to}`}>
            Invoice for this period
          </a>
        </p>
      ) : null}
      <div className="detail-grid">
        <ContactsCard detail={detail as ClientDetail} isAdmin={isAdmin} refresh={refresh} />
        <section className="card client-figures">
          <div className="card-head"><h2>Trio</h2></div>
          {canExport && (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const res = await exportCsvFn({ data: { from: period.from, to: period.to, view: 'intervals', clientId: detail.id } })
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
          <TrioChip recon={allTime} size="lg" />
          <div className="card-head"><h2>Projects</h2></div>
          <table className="recontable">
            <thead><tr><th>Project</th><th>Effort</th></tr></thead>
            <tbody>
              {figures.byProject.map((p) => (
                <tr key={p.id}>
                  <td><Link to="/projects/$projectId" params={{ projectId: p.id }}>{p.name}</Link></td>
                  <td className="mono">{formatHmm(p.period.effortMin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="card-head"><h2>People</h2></div>
          <table className="recontable">
            <thead><tr><th>Worker</th><th>Effort</th>{showMoney ? <th>Billable</th> : null}</tr></thead>
            <tbody>
              {figures.byWorker.map((w) => (
                <tr key={w.workerId}>
                  <td>{w.name}{w.kind === 'agent' ? ' (agent)' : ''}</td>
                  <td className="mono">{formatHmm(w.period.effortMin)}</td>
                  {showMoney ? <td className="mono">{formatCents((w.period as { cents: number }).cents)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
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
      </div>
      {isAdmin && <ManageCard kind="client" id={detail.id} name={detail.name} archivedAt={detail.archivedAt} refresh={refresh} />}
    </main>
  )
}
