import { Fragment, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { applyServerError, serverErrorMessage } from '~/components/forms/applyServerError'
import { RoleEnum, type Role } from '~/lib/schemas/workers'
import type { WorkerView } from '~/server/services/workers'
import {
  archiveWorkerFn,
  createAgentWorkerFn,
  setRolesFn,
  setSupervisorFn,
  updateAgentWorkerFn,
} from '~/server/fns/workers'

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
  onRefresh,
  onResend,
}: {
  workers: WorkerView[]
  onRefresh: () => void
  onResend: (workerId: string) => Promise<{ mailed: boolean }>
}) {
  const humans = workers.filter((w): w is HumanView => w.kind === 'human')
  const agents = workers.filter((w): w is AgentView => w.kind === 'agent')
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
        <td colSpan={6} className="field-error" role="alert">
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
          <table className="intervallist">
            <thead>
              <tr>
                <th>Name</th>
                <th>Roles</th>
                <th>Supervisor</th>
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
                        className="roster-select"
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
                    <td>
                      {w.inviteState === 'pending' ? (
                        <Fragment>
                          <span className="tag tag-warn">pending</span>{' '}
                          <button type="button" onClick={() => void resend(w.workerId)}>
                            Resend
                          </button>
                        </Fragment>
                      ) : (
                        <span className="tag tag-ok">active</span>
                      )}
                      {inviteMsg?.workerId === w.workerId && (
                        <span className={`status-msg ${inviteMsg.ok ? 'status-ok' : 'field-error'}`} role="status">
                          {' '}
                          {inviteMsg.text}
                        </span>
                      )}
                    </td>
                    <td className="intervallist-actions">
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          if (window.confirm(`Archive ${w.name}?`)) void run(w.workerId, () => archiveWorkerFn({ data: { workerId: w.workerId } }))
                        }}
                      >
                        Archive
                      </button>
                    </td>
                  </tr>
                  {errAfter(w.workerId)}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2 className="today-section-title">Agents</h2>
        {agents.length === 0 ? (
          <p className="tree-empty">No agents yet — register one below.</p>
        ) : (
          <table className="intervallist">
            <thead>
              <tr>
                <th>Name</th>
                <th>Model</th>
                <th>Framework</th>
                <th>Status</th>
                <th>Supervisor</th>
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
                      <span className={`tag ${w.status === 'active' ? 'tag-ok' : 'tag-warn'}`}>{w.status}</span>
                    </td>
                    <td>
                      <select
                        className="roster-select"
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
                    <td className="intervallist-actions">
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          if (window.confirm(`Archive agent ${w.name}?`)) void run(w.workerId, () => archiveWorkerFn({ data: { workerId: w.workerId } }))
                        }}
                      >
                        Archive
                      </button>
                    </td>
                  </tr>
                  {errAfter(w.workerId)}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </section>
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
        <button type="submit" className="btn-primary">
          Register agent
        </button>
      </div>
    </form>
  )
}

function FieldError({ errors }: { errors: unknown[] }) {
  const first = errors.find(Boolean)
  return first ? <span className="field-error">{String(first)}</span> : null
}
