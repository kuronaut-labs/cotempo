# My Time Page + Recharts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Reports › My Time summary-first instead of a strip wall (collapsed supervisee lanes, a your-week chart, a trimmed assignments table), and adopt Recharts as the chart library across the reports surfaces.

**Architecture:** Phase 1 is pure UX restructure with existing CSS patterns (no new dependency): supervisee lanes become `<details>` collapsed to their 48px head, self lane stays open. Phase 2 adds `recharts@^3` (the only new dependency, user-sanctioned) and swaps the four chart-shaped surfaces — my-week, weekly trends, hourly effort, per-client totals — onto token-styled Recharts bars with a shared chrome module.

**Tech Stack:** TanStack Start + React 19, recharts ^3 (SVG output, React 19-compatible), existing CSS tokens. No config changes.

## Global Constraints

- The gate is `npm run check` (contract-manifest + eslint + tsc + unit/integration tests). It must be green at the end of every task, or the task is not done. Contract tests the plan touches: none — `tests/contract/**` is never edited.
- Node 24 is on PATH via mise. `npm install` of recharts adds no postinstall scripts (the `allowScripts` machinery only governs workerd/esbuild).
- Money rule (#5): operators never receive a `cents`/`rateCents` key. Every chart in this plan renders **minutes only** (`wallClockMin`/`premiumMin`); money stays in the existing tables where the service already gates it.
- DESIGN.md bindings for all chart work: numerals in `var(--font-mono)`; colors only from `src/styles/tokens.css` (no new hues); overlap is always the 45° 4px-on/4px-off `--premium-fill` hatch (mirrors `.recon .bar.premium`, global.css:1247); tooltips look like the existing popover chrome (surface-card, border-card, radius-md, shadow-2); animations off (`isAnimationActive={false}` — keeps under the ≤200ms transition budget and respects reduced-motion by never animating).
- Comments: only non-derivable why, one line where possible, cite the ticket.
- Never commit unless the user executes this plan — commit steps below run at execution time only.
- Known typing fallback (applies to Tasks 3–6): if tsc rejects `<defs>` as a `BarChart` child, render the hatch via recharts' `<Customized component={<PremiumHatch />} />` instead — same output, sanctioned API.
- Known SSR note: `ResponsiveContainer` renders nothing on the server and measures on the client; no hydration mismatch is expected. Verify the browser console during Task 7.

---

### Task 1: Collapse supervisee lanes on My Time

The self lane stays open; every supervisee lane collapses to its existing head row (name + kind tag + period trio). Reuses the `.today-lane.collapsed` affordance language (hover fill, no default marker).

**Files:**
- Modify: `src/components/operatorLanes.tsx` (whole render, 62 lines)
- Modify: `src/routes/_app/reports.tsx:213-215` (OperatorPanel call site) and `src/routes/_app/reports.tsx:581-615` (OperatorPanel signature)
- Modify: `src/styles/global.css:1375-1399` (lane rules — add summary affordances)

**Interfaces:**
- Produces: `OperatorLanes({ lanes, tz, jobColorIndex, selfWorkerId? })` — `selfWorkerId?: string`. Task 3 reuses the same prop on `OperatorPanel`.
- Produces: `OperatorPanel({ lanes, allocations, tz, from, to, today, selfWorkerId?, onPeriodChange, jobColorIndex })` — gains `selfWorkerId?: string`, passed through to `OperatorLanes`.

- [ ] **Step 1: Change OperatorLanes render to details/summary**

Replace the body of `src/components/operatorLanes.tsx` (keep `asTrio` and `toStripIntervals` as-is):

```tsx
export function OperatorLanes({ lanes, tz, jobColorIndex, selfWorkerId }: {
  lanes: OperatorLaneData[]
  tz: string
  jobColorIndex: Record<string, number>
  selfWorkerId?: string
}) {
  if (lanes.length === 0) {
    return <div className="lanebody-empty">No time logged in this period.</div>
  }
  return (
    <div className="operatorlanes">
      {lanes.map((lane) => {
        // open prop re-applies only for the self lane; supervisee toggles persist across period re-renders.
        return (
          <details className="lane" key={lane.workerId} open={lane.workerId === selfWorkerId || undefined}>
            <summary className="lanehead">
              <div className="nm">
                {lane.name}
                <span className={`wtag ${lane.kind}`}>{lane.kind}</span>
              </div>
              <DayMathChip trio={asTrio(lane.total)} />
            </summary>
            <div className="lanebody">
              {lane.days.length === 0 ? (
                <div className="lanebody-empty">No time logged.</div>
              ) : (
                lane.days.map((d) => {
                  const day: Range = localDayBoundariesUtcMs(d.day, tz)
                  return (
                    <div className="row" key={d.day}>
                      <div className="daylabel">{d.day}</div>
                      <div className="strip">
                        <MiniStrip day={day} tz={tz} intervals={toStripIntervals(d.pieces)} jobColorIndex={jobColorIndex} />
                      </div>
                      <DayMathChip trio={asTrio(d.trio)} />
                    </div>
                  )
                })
              )}
            </div>
          </details>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Thread selfWorkerId from ReportsView through OperatorPanel**

In `src/routes/_app/reports.tsx`:

- OperatorPanel call site (~line 214) gains `selfWorkerId={ctx?.workerId}`.
- OperatorPanel signature gains `selfWorkerId,` … `selfWorkerId?: string` in the type, and passes it on: `<OperatorLanes lanes={lanes} tz={tz} jobColorIndex={jobColorIndex} selfWorkerId={selfWorkerId} />`

- [ ] **Step 3: Add the summary affordance CSS**

In `src/styles/global.css`, immediately after the `.lanehead .nm` rule (~line 1399):

```css
/* Lane heads are <summary>: collapse affordance mirrors today-lane (LD2). */
.lane > .lanehead {
  list-style: none;
  cursor: pointer;
}
.lane > .lanehead::-webkit-details-marker {
  display: none;
}
.lane > .lanehead:hover {
  background: var(--fill-hover);
  border-radius: var(--radius-md);
}
.lane > .lanehead .nm::after {
  content: '▾';
  margin-left: auto;
  font: 400 10px/1 var(--font-mono);
  color: var(--color-info);
  transition: transform 150ms;
}
.lane[open] > .lanehead .nm::after {
  transform: rotate(180deg);
}
```

- [ ] **Step 4: Gate**

Run: `npm run check`
Expected: green (no logic changed; tsc must accept the new prop chain).

- [ ] **Step 5: Commit**

```bash
git add src/components/operatorLanes.tsx src/routes/_app/reports.tsx src/styles/global.css
git commit -m "feat: collapse supervisee lanes on my time"
```

---

### Task 2: Trim the My-assignments table

The Worker column is always "you" on My Time — drop it there. Callers that show other workers (Billing › Allocations) are unchanged.

**Files:**
- Modify: `src/routes/_app/reports.tsx:516-547` (AllocationTable) and the OperatorPanel call site (~line 609)

**Interfaces:**
- Produces: `AllocationTable({ rows, showClient?, showWorker? })` — `showWorker?: boolean`, default `true`. Task 3 does not touch this.

- [ ] **Step 1: Add the prop and gate both header and body cells**

In `AllocationTable`:

```tsx
function AllocationTable({ rows, showClient = true, showWorker = true }: {
  rows: AllocationRow[]
  showClient?: boolean
  showWorker?: boolean
}) {
  return (
    <table className="recontable">
      <thead>
        <tr>
          {showWorker ? <th className="nm">Worker</th> : null}
          <th className="nm">Target</th>
          {showClient ? <th>Client</th> : null}
          <th>Due</th>
          <th>Allocated</th>
          <th>Logged</th>
          <th>Remaining</th>
          <th>Pace</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.assignmentId}>
            {showWorker ? <td className="nm">{r.workerName}</td> : null}
            <td className="nm">{r.targetName}</td>
            {showClient ? <td>{r.clientName}</td> : null}
            <td className="mono">{r.dueOn ?? '—'}</td>
            <td className="money">{r.allocatedMinutes != null ? formatHmm(r.allocatedMinutes) : '—'}</td>
            <td className="money">{formatHmm(r.loggedMinutes)}</td>
            <td className="money">{r.remainingMinutes != null ? formatHmm(r.remainingMinutes) : '—'}</td>
            <td><PaceChip pace={r.pace} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 2: Pass showWorker={false} on My Time**

In OperatorPanel: `<AllocationTable rows={allocations} showClient={false} showWorker={false} />`

- [ ] **Step 3: Gate + commit**

Run: `npm run check` — expected green.

```bash
git add src/routes/_app/reports.tsx
git commit -m "feat: drop the worker column on my assignments"
```

---

### Task 3: recharts + shared chart chrome + My-week chart

The headline the page lacks: one compact stacked bar per day — wall-clock solid ink, overlap hatched. This is the first Recharts task; it creates the dependency and the chrome every other chart reuses.

**Files:**
- Create: `src/components/chartTheme.tsx`
- Create: `src/components/myWeekChart.tsx`
- Create: `tests/unit/myWeekChart.test.ts`
- Modify: `src/routes/_app/reports.tsx` (OperatorPanel — "My week" card after PeriodSelector)
- Modify: `src/styles/global.css` (chart + tooltip rules, near the reports section ~line 1490)

**Interfaces:**
- Produces (chartTheme.tsx): `chartTick` (const), `chartAxisLine` (const), `PremiumHatch()` (component), `ChartTip({ active?, payload?, label? })` (component) — consumed by Tasks 4, 5, 6.
- Produces (myWeekChart.tsx): `dayLabel(iso: string): string`, `myWeekSeries(days: OperatorLane['days'], from: string, to: string): { day: string; label: string; wallClockMin: number; premiumMin: number }[]`, `MyWeekChart({ days, from, to })`.
- Consumes: `OperatorPanel`'s `selfWorkerId` from Task 1; `OperatorLane['days']` from `~/server/services/reports`.

- [ ] **Step 1: Write the failing test**

`tests/unit/myWeekChart.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dayLabel, myWeekSeries } from '~/components/myWeekChart'

const day = (iso: string, wallClockMin: number, premiumMin: number) => ({
  day: iso,
  trio: { wallClockMin, effortMin: wallClockMin + premiumMin, premiumMin },
  pieces: [],
})

describe('dayLabel', () => {
  it('labels with weekday and day number', () => {
    expect(dayLabel('2026-09-28')).toBe('Mon 28')
    expect(dayLabel('2026-10-04')).toBe('Sun 4')
  })
})

describe('myWeekSeries', () => {
  it('zero-fills absent days across the period', () => {
    const out = myWeekSeries([day('2026-09-29', 240, 30)], '2026-09-28', '2026-10-02')
    expect(out.map((d) => d.day)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
    expect(out[1]).toMatchObject({ label: 'Tue 29', wallClockMin: 240, premiumMin: 30 })
    expect(out[0]).toMatchObject({ wallClockMin: 0, premiumMin: 0 })
  })

  it('returns empty for an inverted range', () => {
    expect(myWeekSeries([], '2026-10-02', '2026-09-28')).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project unit tests/unit/myWeekChart.test.ts`
Expected: FAIL — module `~/components/myWeekChart` does not exist.

- [ ] **Step 3: Install recharts**

Run: `npm install recharts@^3`
Expected: package.json gains `"recharts": "^3.x.y"`; no postinstall prompts.

- [ ] **Step 4: Create chartTheme.tsx**

```tsx
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
```

- [ ] **Step 5: Create myWeekChart.tsx**

```tsx
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { ChartTip, PremiumHatch, chartAxisLine, chartTick } from '~/components/chartTheme'
import type { OperatorLane } from '~/server/services/reports'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()}`
}

/* Zero-fill the whole period so absent days read as 0, not gaps (#19). */
export function myWeekSeries(
  days: OperatorLane['days'],
  from: string,
  to: string,
): { day: string; label: string; wallClockMin: number; premiumMin: number }[] {
  const fromMs = Date.parse(`${from}T00:00:00Z`)
  const toMs = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs || toMs - fromMs > 370 * 86_400_000) {
    return []
  }
  const byDay = new Map(days.map((d) => [d.day, d]))
  const out: { day: string; label: string; wallClockMin: number; premiumMin: number }[] = []
  for (let t = fromMs; ; t += 86_400_000) {
    const iso = new Date(t).toISOString().slice(0, 10)
    const d = byDay.get(iso)
    out.push({
      day: iso,
      label: dayLabel(iso),
      wallClockMin: d?.trio.wallClockMin ?? 0,
      premiumMin: d?.trio.premiumMin ?? 0,
    })
    if (iso === to) break
  }
  return out
}

export function MyWeekChart({ days, from, to }: { days: OperatorLane['days']; from: string; to: string }) {
  const data = myWeekSeries(days, from, to)
  if (data.length === 0 || data.every((d) => d.wallClockMin === 0 && d.premiumMin === 0)) {
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
```

- [ ] **Step 6: Run the unit test**

Run: `npx vitest run --project unit tests/unit/myWeekChart.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Add the chart CSS**

In `src/styles/global.css`, before the reports section (~line 1490):

```css
/* ---------- charts (recharts chrome) ---------- */

.chart {
  margin-bottom: var(--space-3);
}
.chart svg {
  display: block;
}
.chart-tip {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2);
  background: var(--surface-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-2);
  font: 400 12px/1.4 var(--font-mono);
  color: var(--color-primary);
}
.chart-tip-label {
  font: 600 12px/1.4 var(--font-body);
  color: var(--color-info);
}
.chart-tip-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.chart-tip-row .sw {
  width: 10px;
  height: 10px;
  flex: none;
  border-radius: var(--radius-xs);
}
```

- [ ] **Step 8: Wire the card into OperatorPanel**

In `src/routes/_app/reports.tsx`, OperatorPanel — import `MyWeekChart`, add near the top of the component:

```tsx
const selfLane = lanes.find((l) => l.workerId === selfWorkerId)
```

and render, directly after `<PeriodSelector … />`:

```tsx
{selfLane ? (
  <section className="card">
    <h2>My week</h2>
    <MyWeekChart days={selfLane.days} from={from} to={to} />
  </section>
) : null}
```

- [ ] **Step 9: Gate + commit**

Run: `npm run check` — expected green (40+ files / 385+ tests).

```bash
git add package.json package-lock.json src/components/chartTheme.tsx src/components/myWeekChart.tsx tests/unit/myWeekChart.test.ts src/routes/_app/reports.tsx src/styles/global.css
git commit -m "feat: my-week chart with recharts"
```

---

### Task 4: Weekly trends chart (Billing › Trends)

The 8-week table is pure chart-shaped data; the chart goes above the table, which stays for exact numbers (utilization included).

**Files:**
- Create: `src/components/trendsChart.tsx`
- Create: `tests/unit/trendsChart.test.ts`
- Modify: `src/routes/_app/reports.tsx:467-485` (trends card in BillingPanel)

**Interfaces:**
- Consumes: `chartTick`, `chartAxisLine`, `PremiumHatch`, `ChartTip` from `~/components/chartTheme` (Task 3).
- Produces: `trendSeries(trends: WeekTrend[]): { label: string; wallClockMin: number; premiumMin: number }[]`, `TrendsChart({ trends })`.

- [ ] **Step 1: Write the failing test**

`tests/unit/trendsChart.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatWeekLabel } from '~/lib/dayMath'
import { trendSeries } from '~/components/trendsChart'

describe('trendSeries', () => {
  it('maps each week to its label and stacked minutes', () => {
    const out = trendSeries([
      { weekStart: '2026-09-28', wallClockMin: 1200, effortMin: 1500, premiumMin: 300, utilization: 0.5 },
    ])
    expect(out).toEqual([{ label: formatWeekLabel('2026-09-28'), wallClockMin: 1200, premiumMin: 300 }])
  })
})
```

- [ ] **Step 2: Verify it fails**

Run: `npx vitest run --project unit tests/unit/trendsChart.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create trendsChart.tsx**

```tsx
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
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run --project unit tests/unit/trendsChart.test.ts`
Expected: PASS.

- [ ] **Step 5: Chart above table in the trends card**

In BillingPanel (`src/routes/_app/reports.tsx`), import `TrendsChart` and change the trends card to:

```tsx
{sub === 'trends' && trends ? (
  <section className="card">
    <h2>Weekly trends</h2>
    <TrendsChart trends={trends} />
    <table className="recontable">
      <thead><tr><th className="nm">Week</th><th>Wall clock</th><th>Effort</th><th>Overlap</th><th>Utilization</th></tr></thead>
      <tbody>
        {trends.map((t) => (
          <tr key={t.weekStart}>
            <td className="nm">{formatWeekLabel(t.weekStart)}</td>
            <td className="money">{formatHmm(t.wallClockMin)}</td>
            <td className="money">{formatHmm(t.effortMin)}</td>
            <td className="money">+{formatHmm(t.premiumMin)}</td>
            <td className="money">{(t.utilization * 100).toFixed(0)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
) : null}
```

- [ ] **Step 6: Gate + commit**

Run: `npm run check` — expected green.

```bash
git add src/components/trendsChart.tsx tests/unit/trendsChart.test.ts src/routes/_app/reports.tsx
git commit -m "feat: weekly trends chart"
```

---

### Task 5: Effort chart replaces the hourly bar rows (Admin)

`EffortBars` keeps its name, file, props and empty state; 16 hourly rows become one 120px chart. The pure shaper `effortBarPercents` and its test die with the markup it shaped.

**Files:**
- Modify: `src/components/effortBars.tsx` (full rewrite)
- Delete: `tests/unit/effortBars.test.ts`
- Modify: `src/styles/global.css:1512-1566` (prune dead row rules, keep `.effortbars-empty`)

**Interfaces:**
- Consumes: `chartTick`, `chartAxisLine`, `PremiumHatch`, `ChartTip` (Task 3).
- Produces: `EffortBars({ series }: { series: AdminKpis['effortSeries'] })` — unchanged signature; `effortBarPercents` is removed (no other consumer).

- [ ] **Step 1: Rewrite effortBars.tsx**

```tsx
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
```

- [ ] **Step 2: Delete the dead test**

Run: `rm tests/unit/effortBars.test.ts`

- [ ] **Step 3: Prune the dead CSS**

In `src/styles/global.css`, delete `.effortbars`, `.effortbars .row`, `.effortbars .hr`, `.effortbars .barwrap`, `.effortbars .bar`, `.effortbars .bar.wall`, `.effortbars .bar.premium`, `.effortbars .nums`, `.effortbars .nums .p` (~lines 1512-1566). Keep `.effortbars-empty`.

Verify no other usage first:

Run: `grep -rn "effortbars" src/ --include="*.tsx"`
Expected: only `effortbars-empty` in `src/components/effortBars.tsx`.

- [ ] **Step 4: Gate + commit**

Run: `npm run check` — expected green (one fewer test file, count drops accordingly).

```bash
git add src/components/effortBars.tsx src/styles/global.css tests/unit/effortBars.test.ts
git commit -m "feat: effort chart replaces hourly bar rows"
```

---

### Task 6: Per-client totals chart replaces the bar rows (Billing › Totals)

`ReconBars` keeps name/props/empty state and its legend; the per-row bars become one Recharts horizontal stacked chart. Money stays in `ReconTable` (charts are minutes-only by the money rule). `barPercents` and its test die with the markup.

**Files:**
- Modify: `src/components/reconBars.tsx` (full rewrite)
- Delete: `tests/unit/reconBars.test.ts`
- Modify: `src/styles/global.css:1213-1259` (prune `.recon` rules), `.reconbars .chart` override

**Interfaces:**
- Consumes: `chartTick`, `chartAxisLine`, `PremiumHatch`, `ChartTip` (Task 3); `.chart` CSS (Task 3).
- Produces: `ReconBars({ report }: { report: ReconciliationReport })` — unchanged signature; `barPercents` is removed (no other consumer).

- [ ] **Step 1: Rewrite reconBars.tsx**

```tsx
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
```

- [ ] **Step 2: Delete the dead test**

Run: `rm tests/unit/reconBars.test.ts`

- [ ] **Step 3: Prune dead CSS, keep legend, add the no-margin override**

In `src/styles/global.css`:

Delete `.recon`, `.recon .nm`, `.recon .barwrap`, `.recon .bar`, `.recon .bar.honest`, `.recon .bar .lbl`, `.recon .bar.premium`, `.recon .nums`, `.recon .nums b`, `.recon .premium-tag` (~lines 1213-1259).

Keep `.reconbars`, `.reconbars-empty`, and all `.reconbars .legend*` rules. After them add:

```css
.reconbars .chart {
  margin-bottom: 0;
}
```

Verify before deleting:

Run: `grep -rn "className=\"recon\"\|'recon'" src/ --include="*.tsx"`
Expected: no matches (only `reconbars` / `recontable` remain, which are different rules).

- [ ] **Step 4: Gate + commit**

Run: `npm run check` — expected green.

```bash
git add src/components/reconBars.tsx src/styles/global.css tests/unit/reconBars.test.ts
git commit -m "feat: per-client totals chart replaces bar rows"
```

---

### Task 7: Full verification pass

No code changes — a browser pass over every touched surface plus the final gate.

**Files:** none.

- [ ] **Step 1: Start the dev stack**

Run: `npm run db:migrate:local && npm run db:seed && npm run dev`
Expected: dev server on http://localhost:3000.

- [ ] **Step 2: Eyeball My Time (operator)**

Log in as `ops@example.com` / `demo-password-123`. Open `/reports` → My time.
Expected: period selector → "My week" chart (stacked bars, hatched overlap, mono ticks, token tooltip, hover column in `--fill-hover`) → My assignments without a Worker column → your lane open with day strips → supervisee lanes collapsed to 48px heads that expand on click; chevron rotates; console free of hydration warnings.

- [ ] **Step 3: Eyeball Billing + Admin**

Log in as `billing@example.com` / `demo-password-123`: Totals (chart + table, no money lost), Trends (chart above table), Daily/Leave/Allocations unchanged. Log in as admin (`ADMIN_PASSWORD` from `.dev.vars`): Admin tab effort chart renders; the invoice route (`/invoice`) still prints correctly (charts are not on it, but confirm the reports CSS edits didn't leak).

- [ ] **Step 4: Final gate**

Run: `npm run check`
Expected: green.

---

## Deliberate non-goals

Do not touch: ministrips (timeline, not a chart), utilization/capacity tracks (inline CSS bars), `ReconTable`/`DailyTable` (money + deltas live there), responsive rework of fixed-width columns (open follow-up from the earlier spacing review), any config file, `tests/contract/**`.
