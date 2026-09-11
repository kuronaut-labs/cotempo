import { useState } from 'react'
import { serverErrorMessage } from '~/components/forms/applyServerError'
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

type RunFn = (op: () => Promise<unknown>) => Promise<void>

export function StructureTree({
  tree,
  manage,
  showArchived,
  onRefresh,
}: {
  tree: ClientNode[]
  manage: ManageLevel
  showArchived: boolean
  onRefresh: () => void
}) {
  const [error, setError] = useState<string | null>(null)

  async function run(op: () => Promise<unknown>) {
    setError(null)
    try {
      await op()
      onRefresh()
    } catch (e) {
      setError(serverErrorMessage(e))
    }
  }

  const live = (n: { archivedAt: Date | null }) => !n.archivedAt
  const clients = showArchived ? tree : tree.filter(live)

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
            <span className="name">{c.name}</span>
            {c.archivedAt && <span className="tag">archived</span>}
            {manage === 'client' && live(c) && <ClientActions node={c} run={run} />}
          </div>
          <div className="tree-projects">
            {(showArchived ? c.projects : c.projects.filter(live)).map((p) => (
              <div key={p.id} className={`tree-project${p.archivedAt ? ' archived' : ''}`}>
                <div className="tree-row">
                  <span className="name">{p.name}</span>
                  {p.archivedAt && <span className="tag">archived</span>}
                  {manage === 'project' && live(p) && <ProjectActions node={p} run={run} />}
                </div>
                <div className="tree-jobs">
                  {(showArchived ? p.jobs : p.jobs.filter(live)).map((j) => (
                    <JobRow key={j.id} node={j} manage={manage} run={run} />
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
          void run(() => updateClientFn({ data: { id: node.id, name: name.trim() } })).then(() => setRenaming(false))
        }}
      >
        <input className="tree-input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Client name" />
        <button type="submit" className="btn-primary">
          Save
        </button>
        <button type="button" onClick={() => setRenaming(false)}>
          Cancel
        </button>
      </form>
    )
  }

  return (
    <span className="tree-actions">
      <button type="button" onClick={() => setRenaming(true)}>
        Rename
      </button>
      <button
        type="button"
        className="danger"
        onClick={() => {
          if (window.confirm(`Archive client ${node.name}?`)) void run(() => archiveClientFn({ data: { id: node.id } }))
        }}
      >
        Archive
      </button>
    </span>
  )
}

function ProjectActions({ node, run }: { node: ProjectNode; run: RunFn }) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(node.name)

  if (renaming) {
    return (
      <form
        className="tree-edit"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          void run(() => updateProjectFn({ data: { id: node.id, name: name.trim() } })).then(() => setRenaming(false))
        }}
      >
        <input className="tree-input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" />
        <button type="submit" className="btn-primary">
          Save
        </button>
        <button type="button" onClick={() => setRenaming(false)}>
          Cancel
        </button>
      </form>
    )
  }

  return (
    <span className="tree-actions">
      <button type="button" onClick={() => setRenaming(true)}>
        Rename
      </button>
      <button
        type="button"
        className="danger"
        onClick={() => {
          if (window.confirm(`Archive project ${node.name}?`)) void run(() => archiveProjectFn({ data: { id: node.id } }))
        }}
      >
        Archive
      </button>
    </span>
  )
}

function JobRow({ node, manage, run }: { node: JobNode; manage: ManageLevel; run: RunFn }) {
  const live = !node.archivedAt
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(node.name)
  const [rate, setRate] = useState(centsToDollarsInput(node.billableRateCents))
  const [fieldError, setFieldError] = useState<string | null>(null)

  if (editing && manage === 'job' && live) {
    return (
      <form
        className="tree-row tree-edit"
        onSubmit={(e) => {
          e.preventDefault()
          const parsed = parseDollars(rate)
          if (!parsed.ok) {
            setFieldError(parsed.error)
            return
          }
          if (!name.trim()) return
          setFieldError(null)
          void run(() =>
            updateJobFn({ data: { id: node.id, name: name.trim(), billableRateCents: parsed.cents } }),
          ).then(() => setEditing(false))
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
        <button type="submit" className="btn-primary">
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)}>
          Cancel
        </button>
        {fieldError && <span className="field-error">{fieldError}</span>}
      </form>
    )
  }

  return (
    <div className={`tree-row${live ? '' : ' archived'}`}>
      <span className="name">{node.name}</span>
      <span className="rate">{rateLabel(node.billableRateCents)}</span>
      {node.archivedAt && <span className="tag">archived</span>}
      {manage === 'job' && live && (
        <span className="tree-actions">
          <button type="button" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (window.confirm(`Archive job ${node.name}?`)) void run(() => archiveJobFn({ data: { id: node.id } }))
            }}
          >
            Archive
          </button>
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
        void run(() => createClientFn({ data: { name: name.trim() } })).then(() => setName(''))
      }}
    >
      <input
        className="tree-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New client name"
        aria-label="New client name"
      />
      <button type="submit" className="btn-primary" disabled={!name.trim()}>
        Add client
      </button>
    </form>
  )
}

function AddProjectForm({ clientId, run }: { clientId: string; run: RunFn }) {
  const [name, setName] = useState('')
  return (
    <form
      className="tree-row tree-add"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        void run(() => createProjectFn({ data: { clientId, name: name.trim() } })).then(() => setName(''))
      }}
    >
      <input
        className="tree-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New project name"
        aria-label="New project name"
      />
      <button type="submit" className="btn-primary" disabled={!name.trim()}>
        Add project
      </button>
    </form>
  )
}

function AddJobForm({ projectId, run }: { projectId: string; run: RunFn }) {
  const [name, setName] = useState('')
  const [rate, setRate] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  return (
    <form
      className="tree-row tree-add"
      onSubmit={(e) => {
        e.preventDefault()
        const parsed = parseDollars(rate)
        if (!parsed.ok) {
          setFieldError(parsed.error)
          return
        }
        if (!name.trim()) return
        setFieldError(null)
        void run(() =>
          createJobFn({ data: { projectId, name: name.trim(), billableRateCents: parsed.cents } }),
        ).then(() => {
          setName('')
          setRate('')
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
      <button type="submit" className="btn-primary" disabled={!name.trim()}>
        Add job
      </button>
      {fieldError && <span className="field-error">{fieldError}</span>}
    </form>
  )
}
