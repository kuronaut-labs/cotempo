import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { Send } from 'reicon-react'
import { applyServerError } from '~/components/forms/applyServerError'
import { humanOptions, rolesFromChecks } from '~/components/workerRoster'
import { Button } from '~/components/ui/button'
import type { WorkerView } from '~/server/services/workers'
import { inviteUserFn } from '~/server/fns/invites'

export function InviteForm({ workers, onRefresh }: { workers: WorkerView[]; onRefresh: () => void }) {
  const [status, setStatus] = useState<string | null>(null)

  const form = useForm({
    defaultValues: { email: '', name: '', billing: false, admin: false, supervisorId: '' },
    validators: {
      onSubmit: ({ value }) => {
        const fields: Record<string, string> = {}
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.email.trim())) fields.email = 'Enter a valid email.'
        if (!value.name.trim()) fields.name = 'Name is required.'
        return Object.keys(fields).length ? { fields } : undefined
      },
    },
    onSubmit: async ({ value }) => {
      setStatus(null)
      try {
        const res = await inviteUserFn({
          data: {
            email: value.email.trim(),
            name: value.name.trim(),
            roles: rolesFromChecks(value.billing, value.admin),
            supervisorId: value.supervisorId || null,
          },
        })
        // #16: the reset token IS the invitation — never render a link or password here.
        setStatus(
          res.mailed
            ? `Invite sent to ${res.email}.`
            : 'Invite saved, but the email failed — use Resend on the roster later.',
        )
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
        <form.Field name="email">
          {(f) => (
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={f.state.value}
                onChange={(e) => f.handleChange(e.target.value)}
                onBlur={f.handleBlur}
              />
              <FieldError errors={f.state.meta.errors} />
            </label>
          )}
        </form.Field>
        <form.Field name="name">
          {(f) => (
            <label className="field">
              <span>Name</span>
              <input value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} onBlur={f.handleBlur} maxLength={100} />
              <FieldError errors={f.state.meta.errors} />
            </label>
          )}
        </form.Field>
      </div>
      <div className="entryform-row">
        <div className="field">
          <span>Roles</span>
          <div>
            <span className="rolecheck">
              <input type="checkbox" checked disabled /> operator
            </span>
            <form.Field name="billing">
              {(f) => (
                <span className="rolecheck">
                  <input
                    type="checkbox"
                    checked={f.state.value}
                    onChange={(e) => f.handleChange(e.target.checked)}
                    onBlur={f.handleBlur}
                  />{' '}
                  billing
                </span>
              )}
            </form.Field>
            <form.Field name="admin">
              {(f) => (
                <span className="rolecheck">
                  <input
                    type="checkbox"
                    checked={f.state.value}
                    onChange={(e) => f.handleChange(e.target.checked)}
                    onBlur={f.handleBlur}
                  />{' '}
                  admin
                </span>
              )}
            </form.Field>
          </div>
        </div>
        <form.Field name="supervisorId">
          {(f) => (
            <label className="field">
              <span>Supervisor (optional)</span>
              <select value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} onBlur={f.handleBlur}>
                <option value="">— none —</option>
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
      {status && (
        <p role="status" className="status-ok">
          {status}
        </p>
      )}
      <div className="entryform-actions">
        <Button type="submit" variant="primary">
          <Send size={14} /> Send invite
        </Button>
      </div>
    </form>
  )
}

function FieldError({ errors }: { errors: unknown[] }) {
  const first = errors.find(Boolean)
  return first ? <span className="field-error">{String(first)}</span> : null
}
