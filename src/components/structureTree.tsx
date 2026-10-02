import { useState } from 'react'
import { Archive as ArchiveIcon, Briefcase, Building, Folder } from 'reicon-react'
import { formatCents } from '~/lib/money'
import { dueStatus, jobDueAfterProject } from '~/lib/dueDates'
import { StatusChip } from '~/components/ui/chip'
import { AssignPills } from '~/components/assignPills'
import { serverErrorMessage } from '~/components/forms/applyServerError'
import { Button } from '~/components/ui/button'
import type { AssignmentView } from '~/server/fns/assignments'
import type { ClientNode, JobNode, ProjectNode } from '~/server/services/structure'
import {
  archiveClientFn,
  archiveJobFn,
  archiveProjectFn,
  createClientFn,
  createJobFn,
  createProjectFn,
  updateClientFn,
  updateJobFn,
  updateProjectFn,
} from '~/server/fns/structure'

export type ManageLevel = 'client' | 'project' | 'job'

/* ---------- pure helpers (tests/unit/structureTree.test.ts) ---------- */

export type RateParse = { ok: true; cents: number | null } | { ok: false; error: string }

/** Blank → null (non-billable); '0' → 0 ($0 billable); at most 2 decimals (#18). */
export function parseDollars(raw: string): RateParse {
  const s = raw.trim()
  if (s === '') return { ok: true, cents: null }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    return { ok: false, error: 'Enter an amount like 90.50 — or leave blank for non-billable.' }
  }
  return { ok: true, cents: Math.round(parseFloat(s) * 100) }
}

export function centsToDollarsInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ''
  return String(cents / 100)
}

export function rateLabel(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return 'non-billable'
  return `$${(cents / 100).toFixed(2)}/hr`
}

/* ---------- component ---------- */

function DueChip({ dueOn, today }: { dueOn: string | null; today: string }) {
  const st = dueStatus(dueOn, today)
  if (st === 'none') return null
  return (
    <StatusChip kind={st === 'ok' ? 'outline' : st === 'soon' ? 'inverse' : 'error'}>Due {dueOn}</StatusChip>
  )
}

type RunFn = (op: () => Promise<unknown>) => Promise<boolean>

export function StructureTree({
  tree,
  manage,
  showArchived,
  today,
  assignments,
  workers,
  onRefresh,
}: {
  tree: ClientNode[]
  manage: ManageLevel
  showArchived: boolean
  today: string
  assignments?: AssignmentView[]
  workers?: { workerId: string; name: string; kind: 'human' | 'agent' }[]
  onRefresh: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const todayIso = today

  async function run(op: () => Promise<unknown>): Promise<boolean> {
    setError(null)
    try {
      await op()
      onRefresh()
      return true
    } catch (e) {
      setError(serverErrorMessage(e))
      return false
    }
  }

  const live = (n: { archivedAt: Date | null }) => !n.archivedAt
  const clients = showArchived ? tree : tree.filter(live)
  const showAssign = Boolean(assignments && workers && manage !== 'client')

  return (
    <div className="tree">
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {manage === 'client' && <AddClientForm run={run} />}
      {clients.length === 0 && <p className="tree-empty">Nothing here yet.</p>}
      {clients.map((c) => (
        <div key={c.id} className={`tree-client${c.archivedAt ? ' archived' : ''}`}>
          <div className="tree-row">
            <span className="name"><Building size={14} /> {c.name}</span>
            {c.archivedAt && <span className="tag">archived</span>}
            {manage === 'client' && live(c) && <ClientActions node={c} run={run} />}
          </div>
          <div className="tree-projects">
            {(showArchived ? c.projects : c.projects.filter(live)).map((p) => (
              <div key={p.id} className={`tree-project${p.archivedAt ? ' archived' : ''}`}>
                <div className="tree-row">
                   <span className="name"><Folder size={14} /> {p.name}</span>
                  {p.archivedAt && <span className="tag">archived</span>}
                  <DueChip dueOn={p.dueOn} today={todayIso} />
                  {showAssign && <AssignPills targetKind="project" targetId={p.id} assignments={assignments!} workers={workers!} run={run} />}
                  {manage === 'project' && live(p) && <ProjectActions node={p} run={run} />}
                </div>
                <div className="tree-jobs">
                    {(showArchived ? p.jobs : p.jobs.filter(live)).map((j) => (
                      <JobRow key={j.id} node={j} manage={manage} run={run} today={todayIso} project={p}
                        assignments={assignments} workers={workers} />
                    ))}
                  {manage === 'job' && live(p) && <AddJobForm projectId={p.id} run={run} />}
                </div>
              </div>
            ))}
            {manage === 'project' && live(c) && <AddProjectForm clientId={c.id} run={run} />}
          </div>
        </div>
      ))}
    </div>
  )
}

function ClientActions({ node, run }: { node: ClientNode; run: RunFn }) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(node.name)

  if (renaming) {
    return (
      <form
        className="tree-edit"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          // Only close on success so a rejected save keeps the form open with
          // the user's input intact. (#L2)
          void run(() => updateClientFn({ data: { id: node.id, name: name.trim() } })).then((ok) => {
            if (ok) setRenaming(false)
          })
        }}
      >
        <input className="tree-input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Client name" />
        <Button type="submit" variant="primary">
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setRenaming(false)}>
          Cancel
        </Button>
      </form>
    )
  }

  return (
    <span className="tree-actions">
      <Button variant="ghost" size="sm" onClick={() => setRenaming(true)}>
        Rename
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="danger"
        onClick={() => {
          if (window.confirm(`Archive client ${node.name}?`)) void run(() => archiveClientFn({ data: { id: node.id } }))
        }}
      >
        <ArchiveIcon size={13} /> Archive
      </Button>
    </span>
  )
}

function ProjectActions({ node, run }: { node: ProjectNode; run: RunFn }) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(node.name)
  const [dueOn, setDueOn] = useState(node.dueOn ?? '')

  if (renaming) {
    return (
      <form
        className="tree-edit"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          // Only close on success — see ClientActions (#L2).
          void run(() =>
            updateProjectFn({ data: { id: node.id, name: name.trim(), dueOn: dueOn === '' ? null : dueOn } }),
          ).then((ok) => {
            if (ok) setRenaming(false)
          })
        }}
      >
        <input className="tree-input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" />
        <input className="tree-input" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} aria-label="Due date" />
        <Button type="submit" variant="primary">
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setRenaming(false)}>
          Cancel
        </Button>
      </form>
    )
  }

  return (
    <span className="tree-actions">
      <Button variant="ghost" size="sm" onClick={() => setRenaming(true)}>
        Rename
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="danger"
        onClick={() => {
          if (window.confirm(`Archive project ${node.name}?`)) void run(() => archiveProjectFn({ data: { id: node.id } }))
        }}
      >
        <ArchiveIcon size={13} /> Archive
      </Button>
    </span>
  )
}

function JobRow({
  node,
  manage,
  run,
  today,
  project,
  assignments,
  workers,
}: {
  node: JobNode
  manage: ManageLevel
  run: RunFn
  today: string
  project: ProjectNode
  assignments?: AssignmentView[]
  workers?: { workerId: string; name: string; kind: 'human' | 'agent' }[]
}) {
  const live = !node.archivedAt
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(node.name)
  const [rate, setRate] = useState(centsToDollarsInput(node.billableRateCents))
  const [budget, setBudget] = useState(centsToDollarsInput(node.budgetCents ?? null))
  const [dueOn, setDueOn] = useState(node.dueOn ?? '')
  const [fieldError, setFieldError] = useState<string | null>(null)

  if (editing && manage === 'job' && live) {
    return (
      <form
        className="tree-row tree-edit"
        onSubmit={(e) => {
          e.preventDefault()
          const parsed = parseDollars(rate)
          const parsedBudget = parseDollars(budget)
          if (!parsed.ok) { setFieldError(parsed.error); return }
          if (!parsedBudget.ok) { setFieldError(parsedBudget.error); return }
          if (!name.trim()) return
          setFieldError(null)
          void run(() =>
            updateJobFn({
              data: {
                id: node.id,
                name: name.trim(),
                billableRateCents: parsed.cents,
                budgetCents: parsedBudget.cents,
                dueOn: dueOn === '' ? null : dueOn,
              },
            }),
          ).then((ok) => {
            if (ok) setEditing(false)
          })
        }}
      >
        <input className="tree-input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Job name" />
        <input
          className="tree-input tree-rate"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="$/hr"
          aria-label="Hourly rate in dollars"
        />
        <input
          className="tree-input tree-rate"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="Budget $"
          aria-label="Budget in dollars"
        />
        <input className="tree-input" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} aria-label="Due date" />
        <Button type="submit" variant="primary">
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        {fieldError && <span className="field-error">{fieldError}</span>}
      </form>
    )
  }

  return (
    <div className={`tree-row${live ? '' : ' archived'}`}>
      <span className="name"><Briefcase size={13} /> {node.name}</span>
      <span className="rate">{rateLabel(node.billableRateCents)}</span>
      {node.budgetCents != null && <span className="rate">{formatCents(node.budgetCents)} budget</span>}
      {node.archivedAt && <span className="tag">archived</span>}
      <DueChip dueOn={node.dueOn} today={today} />
      {assignments && workers ? <AssignPills targetKind="job" targetId={node.id} assignments={assignments} workers={workers} run={run} /> : null}
      {jobDueAfterProject(node.dueOn, project.dueOn) && <span data-tip="Due after its project">!</span>}
      {manage === 'job' && live && (
        <span className="tree-actions">
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="danger"
            onClick={() => {
              if (window.confirm(`Archive job ${node.name}?`)) void run(() => archiveJobFn({ data: { id: node.id } }))
            }}
          >
            <ArchiveIcon size={13} /> Archive
          </Button>
        </span>
      )}
    </div>
  )
}

function AddClientForm({ run }: { run: RunFn }) {
  const [name, setName] = useState('')
  return (
    <form
      className="tree-row tree-add"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        // Only clear on success so a rejected save keeps the typed name. (#L2)
        void run(() => createClientFn({ data: { name: name.trim() } })).then((ok) => {
          if (ok) setName('')
        })
      }}
    >
      <input
        className="tree-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New client name"
        aria-label="New client name"
      />
      <Button type="submit" variant="primary" disabled={!name.trim()}>
        Add client
      </Button>
    </form>
  )
}

function AddProjectForm({ clientId, run }: { clientId: string; run: RunFn }) {
  const [name, setName] = useState('')
  const [dueOn, setDueOn] = useState('')
  return (
    <form
      className="tree-row tree-add"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        // Only clear on success — see AddClientForm (#L2).
        void run(() =>
          createProjectFn({ data: { clientId, name: name.trim(), ...(dueOn !== '' ? { dueOn } : {}) } }),
        ).then((ok) => {
          if (ok) {
            setName('')
            setDueOn('')
          }
        })
      }}
    >
      <input
        className="tree-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New project name"
        aria-label="New project name"
      />
      <input className="tree-input" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} aria-label="Due date" />
      <Button type="submit" variant="primary" disabled={!name.trim()}>
        Add project
      </Button>
    </form>
  )
}

function AddJobForm({ projectId, run }: { projectId: string; run: RunFn }) {
  const [name, setName] = useState('')
  const [rate, setRate] = useState('')
  const [budget, setBudget] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  return (
    <form
      className="tree-row tree-add"
      onSubmit={(e) => {
        e.preventDefault()
        const parsed = parseDollars(rate)
        const parsedBudget = parseDollars(budget)
        if (!parsed.ok) {
          setFieldError(parsed.error)
          return
        }
        if (!parsedBudget.ok) {
          setFieldError(parsedBudget.error)
          return
        }
        if (!name.trim()) return
        setFieldError(null)
        void run(() =>
          createJobFn({
            data: {
              projectId,
              name: name.trim(),
              billableRateCents: parsed.cents,
              budgetCents: parsedBudget.cents,
              ...(dueOn !== '' ? { dueOn } : {}),
            },
          }),
        ).then((ok) => {
          // Only clear on success — see AddClientForm (#L2).
          if (ok) {
            setName('')
            setRate('')
            setBudget('')
            setDueOn('')
          }
        })
      }}
    >
      <input
        className="tree-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New job name"
        aria-label="New job name"
      />
      <input
        className="tree-input tree-rate"
        value={rate}
        onChange={(e) => setRate(e.target.value)}
        placeholder="$/hr (blank = non-billable)"
        aria-label="Hourly rate in dollars, blank for non-billable"
      />
      <input
        className="tree-input tree-rate"
        value={budget}
        onChange={(e) => setBudget(e.target.value)}
        placeholder="Budget $"
        aria-label="Budget in dollars"
      />
      <input className="tree-input" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} aria-label="Due date" />
      <Button type="submit" variant="primary" disabled={!name.trim()}>
        Add job
      </Button>
      {fieldError && <span className="field-error">{fieldError}</span>}
    </form>
  )
}
