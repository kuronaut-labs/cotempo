import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { formatWeekLabel } from '~/lib/dayMath'
import { ChartTip, PremiumHatch, chartAxisLine, chartTick } from '~/components/chartTheme'
import type { WeekTrend } from '~/server/services/reports'

export function trendSeries(trends: WeekTrend[]): { label: string; wallClockMin: number; premiumMin: number }[] {
  return trends.map((t) => ({
    label: formatWeekLabel(t.weekStart),
    wallClockMin: t.wallClockMin,
    premiumMin: t.premiumMin,
  }))
}

export function TrendsChart({ trends }: { trends: WeekTrend[] }) {
  const data = trendSeries(trends)
  if (data.length === 0) return <div className="lanebody-empty">No weeks yet.</div>
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
          <Bar dataKey="wallClockMin" stackId="trend" fill="var(--color-primary)" isAnimationActive={false} />
          <Bar dataKey="premiumMin" stackId="trend" fill="url(#premium-hatch)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
