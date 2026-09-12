import { localDayBoundariesUtcMs } from '~/lib/dayMath'
import { isoWeekStart } from '~/lib/week'

/* Period presets are computed from a `today` prop, never the browser clock (#23).
   `tz` is required: the boundary of a week or month is local. */

const DAY = 86_400_000
const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (utcMs: number) => new Date(utcMs).toISOString().slice(0, 10)
const parse = (iso: string) => iso.split('-').map(Number) as [number, number, number]

export type Preset = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'custom'
export type Period = { from: string; to: string }

export function thisWeek(today: string, tz: string): Period {
  const todayMs = localDayBoundariesUtcMs(today, tz).startMs
  const from = isoWeekStart(todayMs, tz)
  const [y, m, d] = parse(from)
  const to = toIso(Date.UTC(y, m - 1, d + 6))
  return { from, to }
}

export function lastWeek(today: string, tz: string): Period {
  const todayMs = localDayBoundariesUtcMs(today, tz).startMs
  const from = isoWeekStart(todayMs, tz)
  const [y, m, d] = parse(from)
  const fromMs = Date.UTC(y, m - 1, d) - 7 * DAY
  const toMs = fromMs + 6 * DAY
  return { from: toIso(fromMs), to: toIso(toMs) }
}

export function thisMonth(today: string, _tz: string): Period {
  // tz is unused but kept in the signature for symmetry / future locale work.
  const [y, m] = parse(today)
  const fromMs = Date.UTC(y, m - 1, 1)
  // Last day of month: day 0 of next month.
  const toMs = Date.UTC(y, m, 0)
  return { from: toIso(fromMs), to: toIso(toMs) }
}

export function activePreset(period: Period, today: string, tz: string): Preset {
  for (const [id, compute] of [
    ['thisWeek', thisWeek],
    ['lastWeek', lastWeek],
    ['thisMonth', thisMonth],
  ] as const) {
    const p = compute(today, tz)
    if (p.from === period.from && p.to === period.to) return id
  }
  return 'custom'
}

/** Human-friendly range, e.g. 'Sep 1 – Sep 7' (drops the year when same as `today`). */
export function rangeLabel(period: Period, today: string): string {
  const a = formatShort(period.from, today)
  const b = formatShort(period.to, today)
  return a === b ? a : `${a} – ${b}`
}

function formatShort(iso: string, today: string): string {
  const [y, m, d] = parse(iso)
  const month = MONTHS[m - 1]!
  const [ty] = parse(today)
  return ty === y ? `${month} ${d}` : `${month} ${d}, ${y}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/* Avoid unused-var warning on `pad` (kept for symmetry with the rest of the codebase). */
void pad

export function PeriodSelector({
  from,
  to,
  today,
  tz,
  onChange,
}: {
  from: string
  to: string
  today: string
  tz: string
  onChange: (next: Period) => void
}) {
  const active = activePreset({ from, to }, today, tz)
  const presets: { id: Preset; label: string; range: Period }[] = [
    { id: 'thisWeek', label: 'This week', range: thisWeek(today, tz) },
    { id: 'lastWeek', label: 'Last week', range: lastWeek(today, tz) },
    { id: 'thisMonth', label: 'This month', range: thisMonth(today, tz) },
  ]
  return (
    <div className="period" role="group" aria-label="Period">
      <span className="lbl">Period</span>
      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          aria-selected={active === p.id}
          onClick={() => onChange(p.range)}
        >
          {p.label}
        </button>
      ))}
      <span className="range">{rangeLabel({ from, to }, today)}</span>
      <span className="spacer" />
      <input
        type="date"
        value={from}
        aria-label="Period from"
        onChange={(e) => onChange({ from: e.target.value, to })}
      />
      <span className="range">→</span>
      <input
        type="date"
        value={to}
        aria-label="Period to"
        onChange={(e) => onChange({ from, to: e.target.value })}
      />
    </div>
  )
}
