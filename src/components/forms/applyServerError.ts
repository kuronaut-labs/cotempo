import type { AnyFormApi } from '@tanstack/react-form'

const messages: Record<string, string> = {
  END_BEFORE_START: 'End must be after start.',
  MINUTE_ALIGNMENT: 'Use whole minutes.',
  SAME_JOB_OVERLAP: 'This overlaps another entry on the same job. That would bill one client twice for the same minutes.',
  WEEK_LOCKED: 'This week is approved. Ask an admin to unlock it.',
  FORBIDDEN_TARGET: 'You can only log time for yourself or your supervisees.',
  UNAUTHENTICATED: 'Please sign in again.',
}

// Server errors name a field when one applies (#25); otherwise land form-level.
export function applyServerError(form: AnyFormApi, err: unknown) {
  const e = err as { code?: string; field?: string; message?: string } | null
  const code = e?.code ?? 'UNKNOWN'
  const field = e?.field
  const message = messages[code] ?? e?.message ?? 'Something went wrong.'
  if (field && field in form.state.values) {
    form.setFieldMeta(field as never, (m) => ({ ...m, errorMap: { onServer: message } }))
  } else {
    form.setErrorMap({ onServer: message })
  }
}
