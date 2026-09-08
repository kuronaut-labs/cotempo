import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { authClient } from '~/lib/auth-client'
import { applyServerError } from '~/components/forms/applyServerError'
import { getSessionFn } from '~/server/fns/auth'

const LoginInput = z.object({ email: z.email(), password: z.string().min(12) })

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    if (await getSessionFn()) throw redirect({ to: '/today' })
  },
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: { onSubmit: LoginInput },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.signIn.email(value)
      if (error) {
        applyServerError(form, { code: 'AUTH', message: error.message })
        return
      }
      navigate({ to: '/today' })
    },
  })
  return (
    <main className="login-page">
      <h1>Concurrent Timesheeting</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
        className="login-form"
      >
        <form.Field name="email">
          {(f) => (
            <label>
              Email{' '}
              <input
                type="email"
                value={f.state.value}
                onChange={(e) => f.handleChange(e.target.value)}
              />
              {f.state.meta.errors[0] && (
                <span className="field-error">{String(f.state.meta.errors[0])}</span>
              )}
            </label>
          )}
        </form.Field>
        <form.Field name="password">
          {(f) => (
            <label>
              Password{' '}
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
        <button type="submit">Sign in</button>
      </form>
    </main>
  )
}
