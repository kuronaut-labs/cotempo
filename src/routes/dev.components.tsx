import { createFileRoute, notFound } from '@tanstack/react-router'
import { DayMathChip } from '~/components/dayMathChip'
import { DateNav } from '~/components/dateNav'
import { EntryForm } from '~/components/entryForm'
import { IntervalList } from '~/components/intervalList'
import { MiniStrip } from '~/components/miniStrip'
import type { DayIntervalRow } from '~/server/services/intervals'
import type { ClientNode } from '~/server/services/structure'
import type { AgentWorkerView, HumanWorkerView } from '~/server/services/workers'

// Fixture viewer for the 4.4 primitives, to eyeball against the prototype. Dev builds only.
export const Route = createFileRoute('/dev/components')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound()
  },
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

const structureFixture: ClientNode[] = [
  {
    id: 'c1',
    name: 'Acme Aerospace',
    archivedAt: null,
    projects: [
      {
        id: 'p1',
        name: 'Flight Ops Automation',
        archivedAt: null,
        jobs: [
          { id: 'j1', name: 'Pipeline Maintenance', archivedAt: null },
          { id: 'j2', name: 'Eval Harness Runs', archivedAt: null },
        ],
      },
    ],
  },
  {
    id: 'c2',
    name: 'Nimbus Freight',
    archivedAt: null,
    projects: [
      {
        id: 'p2',
        name: 'Route Optimization',
        archivedAt: null,
        jobs: [{ id: 'j3', name: 'Route Model Tuning', archivedAt: null }],
      },
    ],
  },
]

const workerFixture: (HumanWorkerView | AgentWorkerView)[] = [
  { workerId: 'op-worker', kind: 'human', name: 'Demo Operator', email: 'ops@example.com', roles: ['operator'], supervisorId: null, inviteState: 'active' },
  { workerId: 'admin-worker', kind: 'human', name: 'Demo Admin', email: 'admin@example.com', roles: ['operator', 'billing', 'admin'], supervisorId: null, inviteState: 'active' },
  { workerId: 'agent-1', kind: 'agent', name: 'Atlas', model: 'claude-opus-5', framework: 'langgraph', status: 'active', supervisorId: 'op-worker' },
  { workerId: 'agent-2', kind: 'agent', name: 'Beacon', model: 'claude-sonnet-5', framework: 'crewai', status: 'active', supervisorId: 'op-worker' },
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
        <MiniStrip day={day} tz="UTC" intervals={intervals} jobColorIndex={colors} />
        <p style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
          Two overlapping (×2), one separate, one midnight-crossing (trailing clip).
        </p>
      </section>
      <section>
        <h2 style={{ marginBottom: 8 }}>IntervalList</h2>
        <IntervalList
          rows={listRows}
          tz="UTC"
          canEdit={(workerId) => workerId === 'op-worker'}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </section>
      <section>
        <h2 style={{ marginBottom: 8 }}>EntryForm</h2>
        <EntryForm
          date="2026-09-02"
          tz="Australia/Perth"
          selfWorkerId="op-worker"
          superviseeWorkerIds={['agent-1', 'agent-2']}
          workers={workerFixture}
          structure={structureFixture}
          onSubmit={async () => {
            // fixture: no-op; real route wires this to createIntervalFn
          }}
        />
      </section>
    </main>
  )
}
