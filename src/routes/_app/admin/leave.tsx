import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { Check, Plus } from 'reicon-react'
import { Button } from '~/components/ui/button'
import { applyServerError } from '~/components/forms/applyServerError'
import { listLeaveTypesFn, upsertLeaveTypeFn } from '~/server/fns/leave'
import type { LeaveTypeView } from '~/server/fns/leave'

export const Route = createFileRoute('/_app/admin/leave')({
  loader: async () => ({ types: await listLeaveTypesFn() }),
  component: LeaveTypesPage,
})

const METHODS: { value: 'annual_allotment' | 'monthly_prorata' | 'per_hours_worked'; label: string }[] = [
  { value: 'annual_allotment', label: 'Annual allotment' },
  { value: 'monthly_prorata', label: 'Monthly pro-rata' },
  { value: 'per_hours_worked', label: 'Per hours worked' },
]

const BASES: { value: 'calendar' | 'anniversary'; label: string }[] = [
  { value: 'calendar', label: 'Calendar year' },
  { value: 'anniversary', label: 'Hire anniversary' },
]

// key is the stable unique id for a type; new types slug it from the name
const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const FormInput = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  key: z.string().regex(/^[a-z0-9-]{1,40}$/, 'lowercase letters, digits, dashes'),
  paid: z.boolean(),
  accrualMethod: z.enum(['annual_allotment', 'monthly_prorata', 'per_hours_worked']),
  yearBasis: z.enum(['calendar', 'anniversary']),
  minutesPerYear: z.number().int().min(0).max(100_000),
  accrualRatePer10k: z.number().int().min(0).max(10_000),
  maxCarryOverMinutes: z.number().int().min(0).max(100_000),
})

function LeaveTypesPage() {
  const { types } = Route.useLoaderData() as { types: LeaveTypeView[] }

  return (
    <main className="admin">
      <div className="admin-head">
        <h1>Leave types</h1>
        <span className="spacer" />
        <label className="checkline">
          <input type="checkbox" checked readOnly /> Paid types accrue; unpaid types never check balance
        </label>
      </div>
      {types.map((t) => (
        <TypeCard key={t.id} type={t} />
      ))}
      <TypeCard type={null} />
    </main>
  )
}

function TypeCard({ type }: { type: LeaveTypeView | null }) {
  const isEdit = type !== null
  const router = useRouter()
  const form = useForm({
    defaultValues: {
      name: type?.name ?? '',
      key: type?.key ?? '',
      paid: type?.paid ?? true,
      accrualMethod: type?.accrualMethod ?? ('annual_allotment' as const),
      minutesPerYear: type ? Math.round(type.minutesPerYear / 60) : 0,
      accrualRatePer10k: type?.accrualRatePer10k ?? 0,
      maxCarryOverMinutes: type ? Math.round(type.maxCarryOverMinutes / 60) : 0,
      yearBasis: type?.yearBasis ?? ('calendar' as const),
    },
    validators: { onSubmit: FormInput },
    onSubmit: async ({ value }) => {
      try {
        await upsertLeaveTypeFn({
          data: {
            id: type?.id,
            key: isEdit ? type.key : slugify(value.key),
            name: value.name,
            paid: value.paid,
            accrualMethod: value.accrualMethod,
            minutesPerYear: value.minutesPerYear * 60,
            accrualRatePer10k: value.accrualRatePer10k,
            maxCarryOverMinutes: value.maxCarryOverMinutes * 60,
            yearBasis: value.yearBasis,
          },
        })
        form.reset()
        await router.invalidate()
      } catch (e) {
        applyServerError(form, e)
      }
    },
  })

  return (
    <form
      className={isEdit ? 'tree-client' : 'tree-add'}
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <div className="tree-row">
        <span className="name">{isEdit ? type.name : 'New type'}</span>
      </div>
      <div className="entryform-row">
        <form.Field name="name">
          {(field) => (
            <label className="field">
              <span>Name</span>
              <input
                value={field.state.value}
                onChange={(e) => {
                  field.handleChange(e.target.value)
                  if (!isEdit) form.setFieldValue('key', slugify(e.target.value))
                }}
                maxLength={100}
              />
            </label>
          )}
        </form.Field>
        <form.Field name="paid">
          {(field) => (
            <label className="checkline">
              <input
                type="checkbox"
                checked={field.state.value}
                onChange={(e) => field.handleChange(e.target.checked)}
              />{' '}
              Paid
            </label>
          )}
        </form.Field>
      </div>
      <div className="entryform-row">
        <form.Field name="accrualMethod">
          {(field) => (
            <label className="field">
              <span>Accrual</span>
              <select
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value as typeof field.state.value)}
              >
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>
          )}
        </form.Field>
        <form.Field name="yearBasis">
          {(field) => (
            <label className="field">
              <span>Year basis</span>
              <select
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value as typeof field.state.value)}
              >
                {BASES.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </label>
          )}
        </form.Field>
      </div>
      <div className="entryform-row">
        <form.Field name="minutesPerYear">
          {(field) => (
            <label className="field">
              <span>Hours per year</span>
              <input
                type="number"
                min="0"
                max="10000"
                value={field.state.value}
                onChange={(e) => field.handleChange(Number(e.target.value))}
              />
            </label>
          )}
        </form.Field>
        <form.Field name="accrualRatePer10k">
          {(field) => (
            <label className="field">
              <span>Minutes per 10k worked minutes</span>
              <input
                type="number"
                min="0"
                max="10000"
                value={field.state.value}
                onChange={(e) => field.handleChange(Number(e.target.value))}
              />
            </label>
          )}
        </form.Field>
        <form.Field name="maxCarryOverMinutes">
          {(field) => (
            <label className="field">
              <span>Carry-over hours cap</span>
              <input
                type="number"
                min="0"
                max="10000"
                value={field.state.value}
                onChange={(e) => field.handleChange(Number(e.target.value))}
              />
            </label>
          )}
        </form.Field>
      </div>
      <div className="entryform-actions">
        <Button type="submit" variant="primary">
          {isEdit ? <Check size={14} /> : <Plus size={14} />} {isEdit ? 'Save' : 'Add type'}
        </Button>
      </div>
    </form>
  )
}
