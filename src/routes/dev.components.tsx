import { createFileRoute } from '@tanstack/react-router'
import { DayMathChip } from '~/components/dayMathChip'
import { DateNav } from '~/components/dateNav'
import { IntervalList } from '~/components/intervalList'
import { MiniStrip } from '~/components/miniStrip'
import type { DayIntervalRow } from '~/server/services/intervals'

// Dev-only fixture viewer: every UI primitive added in 4.4 renders here with
// hard-coded props, so the reviewer can eye the visuals against the prototype
// without running the full /today route.
export const Route = createFileRoute('/dev/components')({
  component: DevComponents,
})

const dayStart = Date.UTC(2026, 8, 2, 0, 0, 0)
const day = { startMs: dayStart, endMs: dayStart + 24 * 60 * 60 * 1000 }

const intervals = [
  { id: 'i1', jobId: 'j1', startMs: dayStart + 9 * 3_600_000, endMs: dayStart + 12 * 3_600_000 },
  { id: 'i2', jobId: 'j2', startMs: dayStart + 10 * 3_600_000, endMs: dayStart + 13 * 3_600_000 },
  { id: 'i3', jobId: 'j1', startMs: dayStart + 14 * 3_600_000, endMs: dayStart + 18 * 3_600_000 },
  { id: 'i4', jobId: 'j3', startMs: dayStart + 22 * 3_600_000, endMs: dayStart + 26 * 3_600_000 },
]
const colors: Record<string, number> = { j1: 1, j2: 2, j3: 4 }

const listRows: DayIntervalRow[] = [
  {
    id: 'r1',
    workerId: 'op-worker',
    jobId: 'j1',
    jobName: 'Pipeline Maintenance',
    clientName: 'Acme Aerospace',
    startedAt: new Date(dayStart + 9 * 3_600_000),
    endedAt: new Date(dayStart + 11 * 3_600_000),
    note: 'Reviewed pipeline logs',
    editCount: 0,
    createdBy: 'op-worker',
  },
  {
    id: 'r2',
    workerId: 'op-worker',
    jobId: 'j2',
    jobName: 'Eval Harness Runs',
    clientName: 'Acme Aerospace',
    startedAt: new Date(dayStart + 10 * 3_600_000 + 30 * 60_000),
    endedAt: new Date(dayStart + 11 * 3_600_000 + 30 * 60_000),
    note: null,
    editCount: 2,
    createdBy: 'op-worker',
  },
  {
    id: 'r3',
    workerId: 'agent-1',
    jobId: 'j1',
    jobName: 'Pipeline Maintenance',
    clientName: 'Acme Aerospace',
    startedAt: new Date(dayStart + 22 * 3_600_000),
    endedAt: new Date(dayStart + 23 * 3_600_000 + 30 * 60_000),
    note: 'Crew run',
    editCount: 0,
    createdBy: 'op-worker',
  },
]

function DevComponents() {
  return (
    <main style={{ padding: 40, display: 'grid', gap: 24, maxWidth: 720 }}>
      <section>
        <h2 style={{ marginBottom: 8 }}>DayMathChip</h2>
        <DayMathChip trio={{ wallClockMin: 510, effortMin: 600, premiumMin: 90 }} />
        <div style={{ height: 8 }} />
        <DayMathChip trio={{ wallClockMin: 90, effortMin: 120, premiumMin: 30 }} />
        <div style={{ height: 8 }} />
        <DayMathChip trio={{ wallClockMin: 60, effortMin: 60, premiumMin: 0 }} />
      </section>
      <section>
        <h2 style={{ marginBottom: 8 }}>DateNav</h2>
        <DateNav date="2026-09-02" today="2026-09-04" onChange={() => {}} />
        <div style={{ height: 8 }} />
        <DateNav date="2026-09-04" today="2026-09-04" onChange={() => {}} />
      </section>
      <section>
        <h2 style={{ marginBottom: 8 }}>MiniStrip</h2>
        <MiniStrip day={day} intervals={intervals} jobColorIndex={colors} />
        <p style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
          Two overlapping (×2), one separate, one midnight-crossing (trailing clip).
        </p>
      </section>
      <section>
        <h2 style={{ marginBottom: 8 }}>IntervalList</h2>
        <IntervalList
          rows={listRows}
          canEdit={(workerId) => workerId === 'op-worker'}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </section>
    </main>
  )
}
