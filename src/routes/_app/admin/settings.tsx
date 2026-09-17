import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { Check } from 'reicon-react'
import { Button } from '~/components/ui/button'
import { applyServerError } from '~/components/forms/applyServerError'
import { getOrgSettingsFn, updateOrgSettingsFn } from '~/server/fns/settings'
import { formatCents } from '~/lib/money'

const FormInput = z.object({
  rateDollarsPerHour: z.string(), // '' or numeric text; validated below
  dayHours: z.number().min(0.25).max(12),
  weeklyTargetHours: z.string(), // '' = clear, numeric text = set
})

export const Route = createFileRoute('/_app/admin/settings')({
  loader: () => getOrgSettingsFn(),
  component: SettingsPage,
})

function SettingsPage() {
  const settings = Route.useLoaderData()
  const router = useRouter()
  const form = useForm({
    defaultValues: {
      rateDollarsPerHour:
        settings.defaultBillableRateCents != null ? String(settings.defaultBillableRateCents / 100) : '',
      dayHours: settings.defaultDayMinutes / 60,
      weeklyTargetHours: settings.defaultWeeklyTargetHours != null ? String(settings.defaultWeeklyTargetHours) : '',
    },
    validators: {
      onSubmit: FormInput.superRefine((v, ctx) => {
        if (v.rateDollarsPerHour !== '' && !/^\d+(\.\d{1,2})?$/.test(v.rateDollarsPerHour))
          ctx.addIssue({ code: 'custom', path: ['rateDollarsPerHour'], message: 'Enter a dollar amount like 150 or 150.50, or leave blank' })
        if (v.weeklyTargetHours !== '' && !/^\d{1,2}$/.test(v.weeklyTargetHours))
          ctx.addIssue({ code: 'custom', path: ['weeklyTargetHours'], message: 'Enter whole hours 0-80, or leave blank' })
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await updateOrgSettingsFn({
          data: {
            defaultBillableRateCents: value.rateDollarsPerHour === '' ? null : Math.round(Number(value.rateDollarsPerHour) * 100),
            defaultDayMinutes: Math.round(value.dayHours * 60),
            defaultWeeklyTargetHours: value.weeklyTargetHours === '' ? null : Number(value.weeklyTargetHours),
          },
        })
        await router.invalidate()
      } catch (e) {
        applyServerError(form, e)
      }
    },
  })
  return (
    <main className="admin">
      <header className="admin-head">
        <h1>Settings</h1>
      </header>
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <form.Field name="rateDollarsPerHour">
          {(field) => (
            <label className="field">
              <span>Default billable rate</span>
              <input
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="150"
                inputMode="decimal"
              />
              {settings.defaultBillableRateCents != null && (
                <span className="status-msg">Currently {formatCents(settings.defaultBillableRateCents)} per hour</span>
              )}
            </label>
          )}
        </form.Field>
        <form.Field name="dayHours">
          {(field) => (
            <label className="field">
              <span>Default day hours</span>
              <input
                type="number"
                step="0.25"
                min="0.25"
                max="12"
                value={field.state.value}
                onChange={(e) => field.handleChange(Number(e.target.value))}
              />
              <span className="status-msg">Used as the denominator in utilization reports</span>
            </label>
          )}
        </form.Field>
        <form.Field name="weeklyTargetHours">
          {(field) => (
            <label className="field">
              <span>Default weekly target</span>
              <input
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="40"
                inputMode="numeric"
              />
            </label>
          )}
        </form.Field>
        <form.Subscribe>
          {(s) => (
            <Button type="submit" variant="primary" disabled={s.isSubmitting}>
              <Check size={14} /> Save settings
            </Button>
          )}
        </form.Subscribe>
        {String(form.state.errorMap.onServer ?? '') && (
          <p role="alert" className="form-error">
            {String(form.state.errorMap.onServer)}
          </p>
        )}
      </form>
    </main>
  )
}
