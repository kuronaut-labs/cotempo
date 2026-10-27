import { Fragment, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { Archive, Send } from 'reicon-react'
import { applyServerError, serverErrorMessage } from '~/components/forms/applyServerError'
import { RoleEnum, type Role } from '~/lib/schemas/workers'
import type { WorkerView } from '~/server/services/workers'
import type { PositionView } from '~/server/services/positions'
import { createAssignmentFn, archiveAssignmentFn, type AssignmentView } from '~/server/fns/assignments'
import { setWorkerPositionFn } from '~/server/fns/positions'
import {
  archiveWorkerFn,
  createAgentWorkerFn,
  setRolesFn,
  setSupervisorFn,
  updateAgentWorkerFn,
} from '~/server/fns/workers'
import { Button } from '~/components/ui/button'
import { formatHmm } from '~/lib/money'
import type { ClientNode } from '~/server/services/structure'

type HumanView = Extract<WorkerView, { kind: 'human' }>
type AgentView = Extract<WorkerView, { kind: 'agent' }>

/* ---------- pure helpers (tests/unit/workerRoster.test.ts) ---------- */

/** Operator is the locked-on baseline (#5); toggling it changes nothing. */
export function nextRoles(current: Role[], changed: Role, checked: boolean): Role[] {
  if (changed === 'operator') return current
  const set = new Set(current)
  if (checked) set.add(changed)
  else set.delete(changed)
  return RoleEnum.options.filter((r) => set.has(r))
}

export function rolesFromChecks(billing: boolean, admin: boolean): Role[] {
  const roles: Role[] = ['operator']
  if (billing) roles.push('billing')
  if (admin) roles.push('admin')
  return roles
}

export function humanOptions(workers: WorkerView[]): { value: string; label: string }[] {
  return workers.filter((w): w is HumanView => w.kind === 'human').map((h) => ({ value: h.workerId, label: h.name }))
}

/* ---------- roster ---------- */

export function WorkerRoster({
  workers,
  positions,
  assignments = [],
  structure = [],
  onRefresh,
  onResend,
}: {
  workers: WorkerView[]
  positions: PositionView[]
  assignments?: AssignmentView[]
  structure?: ClientNode[]
  onRefresh: () => void
  onResend: (workerId: string) => Promise<{ mailed: boolean }>
}) {
  const humans = workers.filter((w): w is HumanView => w.kind === 'human')
  const agents = workers.filter((w): w is AgentView => w.kind === 'agent')
  const showAssign = assignments.length > 0 || structure.length > 0
  const [rowError, setRowError] = useState<{ workerId: string; text: string } | null>(null)
  const [inviteMsg, setInviteMsg] = useState<{ workerId: string; text: string; ok: boolean } | null>(null)

  async function run(workerId: string, op: () => Promise<unknown>) {
    setRowError(null)
    setInviteMsg(null)
    try {
      await op()
      onRefresh()
    } catch (e) {
      setRowError({ workerId, text: serverErrorMessage(e) })
    }
  }

  async function resend(workerId: string) {
    setRowError(null)
    setInviteMsg(null)
    try {
      const { mailed } = await onResend(workerId)
      setInviteMsg({ workerId, ok: mailed, text: mailed ? 'Invite sent' : 'Mail failed, try again later' })
    } catch (e) {
      setRowError({ workerId, text: serverErrorMessage(e) })
    }
  }

  const errAfter = (workerId: string) =>
    rowError?.workerId === workerId ? (
      <tr>
        <td colSpan={8} className="field-error" role="alert">
          {rowError.text}
        </td>
      </tr>
    ) : null

  return (
    <div className="roster">
      <section className="panel">
        <h2 className="today-section-title">People</h2>
        {humans.length === 0 ? (
          <p className="tree-empty">No people yet — invite one below.</p>
        ) : (
          <div className="intervallist-wrap">
          <table className="intervallist">
            <thead>
              <tr>
                <th>Name</th>
                <th>Roles</th>
                <th>Position</th>
                <th>Supervisor</th>
                {showAssign ? <th>Assignments</th> : null}
                <th>Invite</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {humans.map((w) => (
                <Fragment key={w.workerId}>
                  <tr key={w.workerId}>
                    <td>
                      {w.name}
                      <div className="roster-email">{w.email}</div>
                    </td>
                    <td>
                      <span className="rolecheck">
                        <input type="checkbox" checked disabled /> operator
                      </span>
                      {(['billing', 'admin'] as const).map((r) => (
                        <span key={r} className="rolecheck">
                          <input
                            type="checkbox"
                            checked={w.roles.includes(r)}
                            onChange={(e) => {
                              const next = nextRoles(w.roles, r, e.target.checked)
                              if (next.join() !== w.roles.join()) void run(w.workerId, () => setRolesFn({ data: { workerId: w.workerId, roles: next } }))
                            }}
                          />{' '}
                          {r}
                        </span>
                      ))}
                    </td>
                    <td>
                      <select
                        value={w.positionId ?? ''}
                        onChange={(e) =>
                          void run(w.workerId, () =>
                            setWorkerPositionFn({ data: { workerId: w.workerId, positionId: e.target.value || null } }),
                          )
                        }
                      >
                        <option value="">— none —</option>
                        {positions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={w.supervisorId ?? ''}
                        onChange={(e) =>
                          void run(w.workerId, () =>
                            setSupervisorFn({ data: { workerId: w.workerId, supervisorId: e.target.value || null } }),
                          )
                        }
                      >
                        <option value="">— none —</option>
                        {humanOptions(workers)
                          .filter((o) => o.value !== w.workerId)
                          .map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                      </select>
                    </td>
                    {showAssign && (
                      <td>
                        <AssignmentCell workerId={w.workerId} assignments={assignments} structure={structure} run={run} />
                      </td>
                    )}
                    <td>
                      {w.inviteState === 'pending' ? (
                        <Fragment>
                          <span className="tag tag-warn">Invite sent</span>{' '}
                          <Button type="button" variant="ghost" size="sm" onClick={() => void resend(w.workerId)}>
                            <Send size={13} /> Resend
                          </Button>
                        </Fragment>
                      ) : (
                        <span className="tag tag-ok">Password set</span>
                      )}
                      {inviteMsg?.workerId === w.workerId && (
                        <span className={`status-msg ${inviteMsg.ok ? 'status-ok' : 'field-error'}`} role="status">
                          {' '}
                          {inviteMsg.text}
                        </span>
                      )}
                    </td>
                    <td className="intervallist-actions">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (window.confirm(`Archive ${w.name}?`)) void run(w.workerId, () => archiveWorkerFn({ data: { workerId: w.workerId } }))
                        }}
                      >
                        <Archive size={13} /> Archive
                      </Button>
                    </td>
                  </tr>
                  {errAfter(w.workerId)}
                </Fragment>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="today-section-title">Agents</h2>
        {agents.length === 0 ? (
          <p className="tree-empty">No agents yet — register one below.</p>
        ) : (
          <div className="intervallist-wrap">
          <table className="intervallist">
            <thead>
              <tr>
                <th>Name</th>
                <th>Model</th>
                <th>Framework</th>
                <th>Status</th>
                <th>Supervisor</th>
                {showAssign ? <th>Assignments</th> : null}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {agents.map((w) => (
                <Fragment key={w.workerId}>
                  <tr key={w.workerId}>
                    <td>{w.name}</td>
                    <td className="mono">{w.model}</td>
                    <td className="mono">{w.framework}</td>
                    <td>
                      <span className={`tag ${w.status === 'active' ? 'tag-ok' : 'tag-warn'}`}>{w.status === 'active' ? 'Working' : 'Paused'}</span>
                    </td>
                    <td>
                      <select
                        value={w.supervisorId ?? ''}
                        onChange={(e) =>
                          e.target.value &&
                          void run(w.workerId, () =>
                            updateAgentWorkerFn({ data: { workerId: w.workerId, supervisorId: e.target.value } }),
                          )
                        }
                      >
                        <option value="">— select —</option>
                        {humanOptions(workers).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    {showAssign && (
                      <td>
                        <AssignmentCell workerId={w.workerId} assignments={assignments} structure={structure} run={run} />
                      </td>
                    )}
                    <td className="intervallist-actions">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (window.confirm(`Archive agent ${w.name}?`)) void run(w.workerId, () => archiveWorkerFn({ data: { workerId: w.workerId } }))
                        }}
                      >
                        <Archive size={13} /> Archive
                      </Button>
                    </td>
                  </tr>
                  {errAfter(w.workerId)}
                </Fragment>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  )
}

/* ---------- roster assignments cell ---------- */

function AssignmentCell({
  workerId,
  assignments,
  structure,
  run,
}: {
  workerId: string
  assignments: AssignmentView[]
  structure: ClientNode[]
  run: (workerId: string, op: () => Promise<unknown>) => Promise<void>
}) {
  const mine = assignments.filter((a) => a.workerId === workerId)
  const available = structure.filter((c) => !c.archivedAt)
  return (
    <div className="assignpills">
      {mine.length === 0 ? (
        <span className="lane-empty-note">Nothing assigned</span>
      ) : (
        mine.map((a) => (
          <span key={a.id} className="assignpill">
            {a.targetName}
            <span className="tag" aria-label="Target kind">
              {a.targetKind === 'project' ? 'Project' : 'Job'}
            </span>
            {a.allocatedMinutes != null && <span className="mono">{formatHmm(a.allocatedMinutes)}</span>}
            <button
              type="button"
              className="assignpill-x"
              aria-label="Unassign"
              onClick={() => void run(workerId, () => archiveAssignmentFn({ data: { id: a.id } }))}
            >
              ✕
            </button>
          </span>
        ))
      )}
      {available.length > 0 && (
        <select
          value=""
          aria-label={`Assign worker ${workerId}`}
          onChange={(e) => {
            const [kind, id] = e.target.value.split(':')
            if (id) void run(workerId, () => createAssignmentFn({ data: { workerId, targetKind: kind as 'project' | 'job', targetId: id } }))
          }}
        >
          <option value="">Assign…</option>
          <optgroup label="Projects">
            {available.map((c) => c.projects.filter((p) => !p.archivedAt).map((p) => (
              <option key={p.id} value={`project:${p.id}`}>
                {c.name} / {p.name}
              </option>
            )))}
          </optgroup>
          <optgroup label="Jobs">
            {available.flatMap((c) =>
              c.projects.filter((p) => !p.archivedAt).flatMap((p) =>
                p.jobs.filter((j) => !j.archivedAt).map((j) => (
                  <option key={j.id} value={`job:${j.id}`}>
                    {c.name} / {p.name} / {j.name}
                  </option>
                )),
              ),
            )}
          </optgroup>
        </select>
      )}
    </div>
  )
}

/* ---------- agent registration form (#8 TanStack Form) ---------- */

export function AgentForm({ workers, onRefresh }: { workers: WorkerView[]; onRefresh: () => void }) {
  const form = useForm({
    defaultValues: { name: '', model: '', framework: '', supervisorId: '' },
    validators: {
      onSubmit: ({ value }) => {
        const fields: Record<string, string> = {}
        if (!value.name.trim()) fields.name = 'Name is required.'
        if (!value.model.trim()) fields.model = 'Model is required.'
        if (!value.framework.trim()) fields.framework = 'Framework is required.'
        if (!value.supervisorId) fields.supervisorId = 'Choose a supervisor.'
        return Object.keys(fields).length ? { fields } : undefined
      },
    },
    onSubmit: async ({ value }) => {
      try {
        await createAgentWorkerFn({
          data: {
            name: value.name.trim(),
            model: value.model.trim(),
            framework: value.framework.trim(),
            supervisorId: value.supervisorId,
            status: 'active',
          },
        })
        form.reset()
        onRefresh()
      } catch (e) {
        applyServerError(form, e)
      }
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="admin-form"
    >
      <div className="entryform-row">
        <form.Field name="name">
          {(f) => (
            <label className="field">
              <span>Name</span>
              <input value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} onBlur={f.handleBlur} maxLength={100} />
              <FieldError errors={f.state.meta.errors} />
            </label>
          )}
        </form.Field>
        <form.Field name="model">
          {(f) => (
            <label className="field">
              <span>Model</span>
              <input
                value={f.state.value}
                onChange={(e) => f.handleChange(e.target.value)}
                onBlur={f.handleBlur}
                maxLength={100}
                placeholder="e.g. claude-sonnet-4-6"
              />
              <FieldError errors={f.state.meta.errors} />
            </label>
          )}
        </form.Field>
      </div>
      <div className="entryform-row">
        <form.Field name="framework">
          {(f) => (
            <label className="field">
              <span>Framework</span>
              <input
                value={f.state.value}
                onChange={(e) => f.handleChange(e.target.value)}
                onBlur={f.handleBlur}
                maxLength={100}
                placeholder="e.g. langgraph"
              />
              <FieldError errors={f.state.meta.errors} />
            </label>
          )}
        </form.Field>
        <form.Field name="supervisorId">
          {(f) => (
            <label className="field">
              <span>Supervisor</span>
              <select value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} onBlur={f.handleBlur}>
                <option value="">— select —</option>
                {humanOptions(workers).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <FieldError errors={f.state.meta.errors} />
            </label>
          )}
        </form.Field>
      </div>
      {form.state.errorMap.onServer && (
        <p role="alert" className="form-error">
          {String(form.state.errorMap.onServer)}
        </p>
      )}
      <div className="entryform-actions">
        <Button type="submit" variant="primary">
          Add an AI assistant
        </Button>
      </div>
    </form>
  )
}

function FieldError({ errors }: { errors: unknown[] }) {
  const first = errors.find(Boolean)
  return first ? <span className="field-error">{String(first)}</span> : null
}
