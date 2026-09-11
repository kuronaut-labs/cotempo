import type { AnyFormApi } from '@tanstack/react-form'

const messages: Record<string, string> = {
  END_BEFORE_START: 'End must be after start.',
  MINUTE_ALIGNMENT: 'Use whole minutes.',
  SAME_JOB_OVERLAP: 'This overlaps another entry on the same job. That would bill one client twice for the same minutes.',
  WEEK_LOCKED: 'This week is approved. Ask an admin to unlock it.',
  FORBIDDEN_TARGET: 'You can only log time for yourself or your supervisees.',
  UNAUTHENTICATED: 'Please sign in again.',
  FORBIDDEN: 'Admins only.',
  NOT_FOUND: 'That record no longer exists.',
  EMAIL_TAKEN: 'That email already has an account.',
  SUPERVISOR_NOT_HUMAN: 'Supervisors must be human workers.',
  SUPERVISOR_CYCLE: 'That supervisor assignment would create a loop.',
  ROLES_MUST_INCLUDE_OPERATOR: 'Every person keeps the operator role.',
  HAS_SUPERVISEES: 'This worker still has supervisees — reassign them first.',
  CREATE_USER_FAILED: 'The auth service refused to create that user.',
}

/** Non-form surfaces (tree rows, roster actions) show the same mapped text. */
export function serverErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string } | null
  return messages[e?.code ?? 'UNKNOWN'] ?? e?.message ?? 'Something went wrong.'
}

// Server errors name a field when one applies (#25); otherwise land form-level.
export function applyServerError(form: AnyFormApi, err: unknown) {
  const e = err as { code?: string; field?: string } | null
  const message = serverErrorMessage(err)
  const field = e?.field
  if (field && field in form.state.values) {
    form.setFieldMeta(field as never, (m) => ({ ...m, errorMap: { onServer: message } }))
  } else {
    form.setErrorMap({ onServer: message })
  }
}
