import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTip, PremiumHatch, chartAxisLine, chartTick } from '~/components/chartTheme'
import type { ReconciliationReport } from '~/server/services/reports'

function truncate(name: string): string {
  return name.length > 18 ? `${name.slice(0, 17)}…` : name
}

/* Per-client horizontal bars: wall-clock solid ink, overlap hatched. Minutes only — money lives in ReconTable (#5). */
export function ReconBars({ report }: { report: ReconciliationReport }) {
  if (report.clients.length === 0) {
    return <div className="reconbars-empty">No time logged in this period.</div>
  }
  const data = report.clients.map((c) => ({
    label: c.name,
    wallClockMin: c.wallClockMin,
    premiumMin: c.premiumMin,
  }))
  return (
    <div className="reconbars">
      <div className="legend">
        <span>
          <span className="sw honest" /> On the clock
        </span>
        <span>
          <span className="sw premium" /> Overlap
        </span>
      </div>
      <div className="chart">
        <ResponsiveContainer width="100%" height={data.length * 28 + 8}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <PremiumHatch />
            </defs>
            <CartesianGrid horizontal={false} stroke="var(--color-tertiary)" />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              width={140}
              tick={chartTick}
              tickLine={false}
              axisLine={chartAxisLine}
              tickFormatter={truncate}
            />
            <Tooltip content={<ChartTip />} cursor={{ fill: 'var(--fill-hover)' }} />
            <Bar dataKey="wallClockMin" stackId="client" fill="var(--color-primary)" isAnimationActive={false} />
            <Bar dataKey="premiumMin" stackId="client" fill="url(#premium-hatch)" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
