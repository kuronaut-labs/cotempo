import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { ChartTip, PremiumHatch, chartAxisLine, chartTick } from '~/components/chartTheme'
import type { AdminKpis } from '~/server/services/reports'

function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}

/* Hourly effort stacked: wall-clock solid, overlap hatched (#11/#13). */
export function EffortBars({ series }: { series: AdminKpis['effortSeries'] }) {
  const data = series.map((p) => ({
    label: formatHour(p.hour),
    wallClockMin: p.wallClockMin,
    premiumMin: p.effortMin - p.wallClockMin,
  }))
  if (data.length === 0 || data.every((d) => d.wallClockMin === 0 && d.premiumMin === 0)) {
    return <div className="effortbars-empty">No time logged this day.</div>
  }
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <PremiumHatch />
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-tertiary)" />
          <XAxis dataKey="label" tick={chartTick} tickLine={false} axisLine={chartAxisLine} interval="preserveStartEnd" />
          <Tooltip content={<ChartTip />} cursor={{ fill: 'var(--fill-hover)' }} />
          <Bar dataKey="wallClockMin" stackId="effort" fill="var(--color-primary)" isAnimationActive={false} />
          <Bar dataKey="premiumMin" stackId="effort" fill="url(#premium-hatch)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
