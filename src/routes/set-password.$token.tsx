import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { authClient } from '~/lib/auth-client'
import { applyServerError } from '~/components/forms/applyServerError'

const Input = z
  .object({ password: z.string().min(12), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] })

export const Route = createFileRoute('/set-password/$token')({ component: SetPasswordPage })

function SetPasswordPage() {
  const { token } = Route.useParams()
  const navigate = useNavigate()
  const form = useForm({
    defaultValues: { password: '', confirm: '' },
    validators: { onSubmit: Input },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.resetPassword({ newPassword: value.password, token })
      if (error) {
        applyServerError(form, { code: 'AUTH', message: error.message })
        return
      }
      navigate({ to: '/login' })
    },
  })
  return (
    <main className="login-page">
      <h1>Set your password</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
        className="login-form"
      >
        <form.Field name="password">
          {(f) => (
            <label>
              New password{' '}
              <input
                type="password"
                value={f.state.value}
                onChange={(e) => f.handleChange(e.target.value)}
              />
              {f.state.meta.errors[0] && (
                <span className="field-error">{String(f.state.meta.errors[0])}</span>
              )}
            </label>
          )}
        </form.Field>
        <form.Field name="confirm">
          {(f) => (
            <label>
              Confirm{' '}
              <input
                type="password"
                value={f.state.value}
                onChange={(e) => f.handleChange(e.target.value)}
              />
              {f.state.meta.errors[0] && (
                <span className="field-error">{String(f.state.meta.errors[0])}</span>
              )}
            </label>
          )}
        </form.Field>
        <form.Subscribe selector={(s) => s.errorMap.onServer}>
          {(err) =>
            err ? (
              <p role="alert" className="form-error">
                {String(err)}
              </p>
            ) : null
          }
        </form.Subscribe>
        <button type="submit">Set password</button>
      </form>
    </main>
  )
}
