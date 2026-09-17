import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { FileDownload } from 'reicon-react'
import { KpiTile } from '~/components/kpiTile'
import { Button, buttonClass } from '~/components/ui/button'
import { EffortBars } from '~/components/effortBars'
import { OperatorLanes } from '~/components/operatorLanes'
import { PeriodSelector, thisWeek } from '~/components/periodSelector'
import { ReconBars } from '~/components/reconBars'
import { ReconTable } from '~/components/reconTable'
import { DailyTable } from '~/components/dailyTable'
import { SubTabs } from '~/components/subTabs'
import { formatCents, formatHmm } from '~/lib/money'
import { getSessionCtxFn } from '~/server/fns/auth'
import { getTodayFn } from '~/server/fns/intervals'
import {
  adminKpisFn,
  dailyFn,
  operatorLanesFn,
  perJobFn,
  reconciliationFn,
} from '~/server/fns/reports'
import { exportCsvFn } from '~/server/fns/exports'
import { listStructureFn } from '~/server/fns/structure'
import { StructureTree, rateLabel } from '~/components/structureTree'
import type { SessionContext } from '~/server/context'
import type { AdminKpis } from '~/server/services/reports'
import type { ClientNode } from '~/server/services/structure'

const searchSchema = z.object({
  tab: z.enum(['admin', 'billing', 'operator']).optional(),
  sub: z.enum(['recon', 'daily']).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional(),
})

type Search = z.infer<typeof searchSchema>
type TabId = 'admin' | 'billing' | 'operator'
type SubId = 'recon' | 'daily'

/* Default tab = highest role; default sub = 'recon' under billing. */
function defaultTab(ctx: SessionContext | null): TabId {
  if (!ctx) return 'operator'
  if (ctx.roles.includes('admin')) return 'admin'
  if (ctx.roles.includes('billing')) return 'billing'
  return 'operator'
}

function visibleTabs(ctx: SessionContext | null): { id: TabId; label: string }[] {
  const tabs: { id: TabId; label: string }[] = [{ id: 'operator', label: 'My time' }]
  if (ctx?.roles.includes('billing') || ctx?.roles.includes('admin')) tabs.unshift({ id: 'billing', label: 'Billing' })
  if (ctx?.roles.includes('admin')) tabs.unshift({ id: 'admin', label: 'Admin' })
  return tabs
}

export const Route = createFileRoute('/_app/reports')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => {
    const { tab, sub, from, to } = search
    return { tab, sub, from, to }
  },
  loader: async ({ deps }) => {
    const todayP = getTodayFn()
    const [today, ctx] = await Promise.all([todayP, getSessionCtxFn()])
    const tz = today.tz
    const week = thisWeek(today.date, tz)
    const tab: TabId = deps.tab ?? defaultTab(ctx)
    const sub: SubId = deps.sub ?? 'recon'
    const from = deps.from ?? week.from
    const to = deps.to ?? week.to

    if (tab === 'admin' && ctx?.roles.includes('admin')) {
      const [kpis, structure] = await Promise.all([
        adminKpisFn({ data: { date: to } }),
        listStructureFn({ data: { includeArchived: false } }),
      ])
      return { today: today.date, tz, ctx, tab, sub, from, to, kpis, structure }
    }
    if (tab === 'billing' && (ctx?.roles.includes('billing') || ctx?.roles.includes('admin'))) {
      const period = { from, to }
      if (sub === 'daily') {
        const [daily, jobs] = await Promise.all([dailyFn({ data: period }), perJobFn({ data: period })])
        return { today: today.date, tz, ctx, tab, sub, from, to, daily, jobs }
      }
      const [recon, jobs] = await Promise.all([reconciliationFn({ data: period }), perJobFn({ data: period })])
      return { today: today.date, tz, ctx, tab, sub, from, to, recon, jobs }
    }
    const lanes = await operatorLanesFn({ data: { from, to } })
    return { today: today.date, tz, ctx, tab, sub, from, to, lanes }
  },
  component: ReportsView,
})

function goSearch(navigate: ReturnType<typeof useNavigate>, next: Partial<Search>) {
  navigate({ to: '/reports', search: (prev) => ({ ...prev, ...next }) })
}

function ReportsView() {
  const data = Route.useLoaderData() as {
    today: string
    tz: string
    ctx: SessionContext | null
    tab: TabId
    sub: SubId
    from: string
    to: string
    kpis?: AdminKpis
    structure?: ClientNode[]
    recon?: import('~/server/services/reports').ReconciliationReport
    daily?: import('~/server/services/reports').DailyReport
    jobs?: import('~/server/services/reports').JobRecon[]
    lanes?: import('~/server/services/reports').OperatorLane[]
  }
  const navigate = useNavigate()
  const { today, tz, ctx, tab, sub, from, to } = data

  const tabs = visibleTabs(ctx)
  // Guard: if a forbidden tab is in the URL, fall back to the user's default.
  const activeTab: TabId = tabs.some((t) => t.id === tab) ? tab : defaultTab(ctx)

  return (
    <main className="reports">
      <header className="reports-head">
        <h1>Reports</h1>
      </header>

      <nav className="tabs" role="tablist" aria-label="Report tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            className="tab"
            onClick={() => goSearch(navigate, { tab: t.id })}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {activeTab === 'admin' && data.kpis && data.structure ? (
        <AdminPanel
          kpis={data.kpis}
          structure={data.structure}
          to={to}
          onDateChange={(next) => goSearch(navigate, { to: next })}
        />
      ) : null}

      {activeTab === 'billing' ? (
        <BillingPanel
          sub={sub}
          from={from}
          to={to}
          today={today}
          tz={tz}
          recon={data.recon}
          daily={data.daily}
          onPeriodChange={(p) => goSearch(navigate, { from: p.from, to: p.to })}
          onSubChange={(s) => goSearch(navigate, { sub: s })}
        />
      ) : null}

      {activeTab === 'operator' && data.lanes ? <OperatorPanel lanes={data.lanes} tz={tz} /> : null}
    </main>
  )
}

function AdminPanel({
  kpis,
  structure,
  to,
  onDateChange,
}: {
  kpis: AdminKpis
  structure: ClientNode[]
  to: string
  onDateChange: (next: string) => void
}) {
  return (
    <div className="reports-panel">
      <header className="reports-subhead">
        <h2>Admin</h2>
        <span className="spacer" />
        <label className="dateonly">
          <span className="lbl">Date</span>
          <input type="date" value={to} aria-label="Admin date" onChange={(e) => onDateChange(e.target.value)} />
        </label>
      </header>

      <div className="kpis">
        <KpiTile
          label="Workers"
          value={`${kpis.workers.humans}h · ${kpis.workers.agents}a`}
          hint={`${kpis.workers.humans + kpis.workers.agents} active`}
        />
        <KpiTile
          label="Structure"
          value={`${kpis.structure.clients}c · ${kpis.structure.projects}p`}
          hint={`${kpis.structure.jobs} jobs`}
        />
        <KpiTile label="Billable" value={formatCents(kpis.todayBillableCents)} hint={kpis.date} />
        <KpiTile label="Overlap" value={`+${formatHmm(kpis.todayPremiumMin)}`} />
        <KpiTile
          label="Utilization"
          value={`${(kpis.utilization * 100).toFixed(0)}%`}
          hint={`share of an ${kpis.defaultDayMinutes / 60}-hour day`}
        />
        {kpis.weeklyTargetHours != null && (
          <KpiTile
            label="Week vs target"
            value={formatHmm(kpis.weekWallClockMin ?? 0)}
            hint={`of ${formatHmm(kpis.weeklyTargetHours * 60)} target`}
          />
        )}
      </div>

      <section className="card">
        <h2>Worker utilization</h2>
        <ul className="util-list">
          {kpis.perWorker.length === 0 ? <li className="lanebody-empty">No time logged today.</li> : null}
          {kpis.perWorker.map((w) => (
            <li key={w.workerId} className="util-row">
              <span className="nm">{w.name}</span>
              <span className="track">
                <span
                  className={`fill${w.utilization > 1 ? ' high' : ''}`}
                  style={{ width: `${Math.min(100, w.utilization * 100)}%` }}
                />
              </span>
              <span className="val">{formatHmm(w.wallClockMin)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Today’s concurrent effort</h2>
        <EffortBars series={kpis.effortSeries} />
      </section>

      <section className="card">
        <h2>Structure &amp; rates</h2>
        <StructureTree tree={structure} manage="job" showArchived={false} onRefresh={() => {}} />
        <div className="legend" style={{ marginTop: 8 }}>
          <span>
            <span className="sw" style={{ background: 'var(--color-success)' }} />billable
          </span>
          <span>
            <span className="sw" style={{ background: 'var(--color-info)' }} />non-billable
          </span>
          <span className="legend-hint">
            rates: {rateLabel(10000)} · {rateLabel(null)}
          </span>
        </div>
      </section>
    </div>
  )
}

function BillingPanel({
  sub,
  from,
  to,
  today,
  tz,
  recon,
  daily,
  onPeriodChange,
  onSubChange,
}: {
  sub: SubId
  from: string
  to: string
  today: string
  tz: string
  recon?: import('~/server/services/reports').ReconciliationReport
  daily?: import('~/server/services/reports').DailyReport
  onPeriodChange: (next: { from: string; to: string }) => void
  onSubChange: (next: SubId) => void
}) {
  return (
    <div className="reports-panel">
      <PeriodSelector from={from} to={to} today={today} tz={tz} onChange={onPeriodChange} />

      <SubTabs
        tabs={[
          { id: 'recon', label: 'Totals' },
          { id: 'daily', label: 'Daily' },
        ]}
        active={sub}
        onChange={(id) => onSubChange(id as SubId)}
      />

      <div className="period-exports">
        <Button variant="secondary" size="sm" type="button"
          onClick={async () => {
            // Sub tab 'recon' maps to CSV view 'intervals'; 'daily' maps to 'daily'.
            const view: 'intervals' | 'daily' = sub === 'recon' ? 'intervals' : 'daily'
            const res = await exportCsvFn({ data: { from, to, view } })
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const disp = res.headers.get('content-disposition') ?? ''
            const m = /filename="([^"]+)"/.exec(disp)
            a.download = m?.[1] ?? `timesheets-${from}_${to}-${sub}.csv`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
          }}
        >
          <FileDownload size={13} /> Export CSV
        </Button>
        <a
          className={buttonClass('secondary', 'sm')}
          href={`/invoice?from=${from}&to=${to}`}
          target="_blank"
          rel="noreferrer"
        >
          Export PDF
        </a>
      </div>

      {sub === 'recon' && recon ? (
        <>
          <section className="card">
            <h2>Per-client totals</h2>
            <ReconTable report={recon} />
          </section>
          <section className="card">
            <h2>Totals bars</h2>
            <ReconBars report={recon} />
          </section>
        </>
      ) : null}

      {sub === 'daily' && daily ? (
        <section className="card">
          <h2>Daily breakdown</h2>
          <DailyTable report={daily} />
        </section>
      ) : null}
    </div>
  )
}

function OperatorPanel({ lanes, tz }: { lanes: import('~/server/services/reports').OperatorLane[]; tz: string }) {
  return (
    <div className="reports-panel">
      <header className="reports-subhead">
        <h2>My time and my team's</h2>
      </header>
      <OperatorLanes lanes={lanes} tz={tz} />
    </div>
  )
}
