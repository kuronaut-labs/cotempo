import { formatHmm } from '~/lib/money'

/* Shared chart chrome: every recharts chart wears the design tokens (DESIGN.md). */
export const chartTick = { fill: 'var(--color-info)', fontSize: 10, fontFamily: 'var(--font-mono)' } as const
export const chartAxisLine = { stroke: 'var(--color-tertiary)' } as const

/* 45° 4px-on/4px-off hatch in --premium-fill, mirroring .recon .bar.premium (#11/#13). */
export function PremiumHatch() {
  return (
    <pattern id="premium-hatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="8" stroke="var(--premium-fill)" strokeWidth="4" />
    </pattern>
  )
}

/* Tooltip body in popover chrome (surface-card / border-card / radius-md / shadow-2). */
export function ChartTip({ active, payload, label }: {
  active?: boolean
  payload?: { name?: string; value?: number | string; fill?: string }[]
  label?: string | number
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="chart-tip">
      <div className="chart-tip-label">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="chart-tip-row">
          <span
            className="sw"
            style={{ background: p.fill === 'url(#premium-hatch)' ? 'var(--premium-fill)' : p.fill }}
          />
          {p.name === 'premiumMin' ? 'Overlap' : 'On the clock'}: {formatHmm(Number(p.value))}
        </div>
      ))}
    </div>
  )
}
