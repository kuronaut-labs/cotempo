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
  gapWallHours: z.string(), // '' = default, numeric text = hours
  lateEntryDays: z.string(),
  multiEditOver: z.string(),
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
      gapWallHours: settings.flagGapMinWallMin != null ? String(settings.flagGapMinWallMin / 60) : '',
      lateEntryDays: settings.flagLateEntryDays != null ? String(settings.flagLateEntryDays) : '',
      multiEditOver: settings.flagMultiEditOver != null ? String(settings.flagMultiEditOver) : '',
    },
    validators: {
      onSubmit: FormInput.superRefine((v, ctx) => {
        if (v.rateDollarsPerHour !== '' && !/^\d+(\.\d{1,2})?$/.test(v.rateDollarsPerHour))
          ctx.addIssue({ code: 'custom', path: ['rateDollarsPerHour'], message: 'Enter a dollar amount like 150 or 150.50, or leave blank' })
        if (v.weeklyTargetHours !== '' && !/^\d{1,2}$/.test(v.weeklyTargetHours))
          ctx.addIssue({ code: 'custom', path: ['weeklyTargetHours'], message: 'Enter whole hours 0-80, or leave blank' })
        if (v.gapWallHours !== '' && !/^\d+(\.\d{1,2})?$/.test(v.gapWallHours))
          ctx.addIssue({ code: 'custom', path: ['gapWallHours'], message: 'Enter hours like 8 or 7.5, or leave blank' })
        if (v.lateEntryDays !== '' && !/^\d{1,2}$/.test(v.lateEntryDays))
          ctx.addIssue({ code: 'custom', path: ['lateEntryDays'], message: 'Enter whole days 0-90, or leave blank' })
        if (v.multiEditOver !== '' && !/^\d{1,2}$/.test(v.multiEditOver))
          ctx.addIssue({ code: 'custom', path: ['multiEditOver'], message: 'Enter a count 0-50, or leave blank' })
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await updateOrgSettingsFn({
          data: {
            defaultBillableRateCents: value.rateDollarsPerHour === '' ? null : Math.round(Number(value.rateDollarsPerHour) * 100),
            defaultDayMinutes: Math.round(value.dayHours * 60),
            defaultWeeklyTargetHours: value.weeklyTargetHours === '' ? null : Number(value.weeklyTargetHours),
            flagGapMinWallMin: value.gapWallHours === '' ? null : Math.round(Number(value.gapWallHours) * 60),
            flagLateEntryDays: value.lateEntryDays === '' ? null : Number(value.lateEntryDays),
            flagMultiEditOver: value.multiEditOver === '' ? null : Number(value.multiEditOver),
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
        <form.Field name="gapWallHours">
          {(field) => (
            <label className="field">
              <span>Gap threshold (hours)</span>
              <input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="8" inputMode="decimal" />
              <span className="status-msg">A Mon–Fri day with wall-clock below this flags for review</span>
            </label>
          )}
        </form.Field>
        <form.Field name="lateEntryDays">
          {(field) => (
            <label className="field">
              <span>Late-entry window (days)</span>
              <input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="7" inputMode="numeric" />
              <span className="status-msg">Entries created this many days after the week ends flag</span>
            </label>
          )}
        </form.Field>
        <form.Field name="multiEditOver">
          {(field) => (
            <label className="field">
              <span>Edit threshold (count)</span>
              <input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="2" inputMode="numeric" />
              <span className="status-msg">Entries edited more than this many times flag</span>
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
