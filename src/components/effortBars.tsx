import type { AdminKpis } from '~/server/services/reports'

/* Hourly effort bar: width scales to the largest effort in the series. The bar is split
   into solid wall-clock + hatched premium = effort; the hatched region is the concurrency
   surplus, matching the per-day trio elsewhere. */
export function effortBarPercents(series: AdminKpis['effortSeries']): { hour: number; wallPct: number; premiumPct: number; effortMin: number; wallMin: number }[] {
  const max = series.reduce((m, p) => Math.max(m, p.effortMin), 0)
  if (max === 0) return []
  return series.map((p) => ({
    hour: p.hour,
    wallMin: p.wallClockMin,
    effortMin: p.effortMin,
    wallPct: (p.wallClockMin / max) * 100,
    premiumPct: ((p.effortMin - p.wallClockMin) / max) * 100,
  }))
}

function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}

export function EffortBars({ series }: { series: AdminKpis['effortSeries'] }) {
  const rows = effortBarPercents(series)
  if (rows.length === 0) {
    return <div className="effortbars-empty">No time logged this day.</div>
  }
  return (
    <div className="effortbars">
      {rows.map((r) => (
        <div className="row" key={r.hour}>
          <div className="hr">{formatHour(r.hour)}</div>
          <div className="barwrap">
            <div className="bar wall" style={{ left: 0, width: `${r.wallPct}%` }} />
            <div className="bar premium" style={{ left: `${r.wallPct}%`, width: `${r.premiumPct}%` }} />
          </div>
          <div className="nums">
            {r.wallMin}m wall
            {r.effortMin - r.wallMin > 0 ? <> · <span className="p">+{r.effortMin - r.wallMin}m premium</span></> : null}
          </div>
        </div>
      ))}
    </div>
  )
}
