import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { ChartTip, PremiumHatch, chartAxisLine, chartTick } from '~/components/chartTheme'
import type { OperatorLane } from '~/server/services/reports'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_MS = 86_400_000
// Beyond about a year the daily bars stop being readable; caller shows a distinct note (#plan T3).
const MAX_SPAN_MS = 370 * DAY_MS

export function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()}`
}

/* True when the period can't be charted at all (bad, inverted, or too-wide range). */
export function weekSeriesBlocked(from: string, to: string): boolean {
  const fromMs = Date.parse(`${from}T00:00:00Z`)
  const toMs = Date.parse(`${to}T00:00:00Z`)
  return !Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs || toMs - fromMs > MAX_SPAN_MS
}

/* Zero-fill the whole period so absent days read as 0, not gaps (#19). */
export function myWeekSeries(
  days: OperatorLane['days'],
  from: string,
  to: string,
): { day: string; label: string; wallClockMin: number; premiumMin: number }[] {
  if (weekSeriesBlocked(from, to)) return []
  const fromMs = Date.parse(`${from}T00:00:00Z`)
  const toMs = Date.parse(`${to}T00:00:00Z`)
  const byDay = new Map(days.map((d) => [d.day, d]))
  const out: { day: string; label: string; wallClockMin: number; premiumMin: number }[] = []
  for (let t = fromMs; t <= toMs; t += DAY_MS) {
    const iso = new Date(t).toISOString().slice(0, 10)
    const d = byDay.get(iso)
    out.push({
      day: iso,
      label: dayLabel(iso),
      wallClockMin: d?.trio.wallClockMin ?? 0,
      premiumMin: d?.trio.premiumMin ?? 0,
    })
  }
  return out
}

export function MyWeekChart({ days, from, to }: { days: OperatorLane['days']; from: string; to: string }) {
  const data = myWeekSeries(days, from, to)
  if (weekSeriesBlocked(from, to)) {
    return <div className="lanebody-empty">Range too wide to chart — pick a shorter period.</div>
  }
  if (data.every((d) => d.wallClockMin === 0 && d.premiumMin === 0)) {
    return <div className="lanebody-empty">No time logged this period.</div>
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
          <Bar dataKey="wallClockMin" stackId="week" fill="var(--color-primary)" isAnimationActive={false} />
          <Bar dataKey="premiumMin" stackId="week" fill="url(#premium-hatch)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
