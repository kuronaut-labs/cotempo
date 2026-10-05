import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { Check, Plus, Trash2 } from 'reicon-react'
import { Button } from '~/components/ui/button'
import { StatusChip } from '~/components/ui/chip'
import { applyServerError } from '~/components/forms/applyServerError'
import {
  archiveContactFn,
  createContactFn,
  setPrimaryContactFn,
  updateClientDetailsFn,
  updateContactFn,
  type ClientDetail,
  type ContactView,
} from '~/server/fns/clients'
import { CreateContactInput, UpdateClientDetailsInput } from '~/lib/schemas/clients'

/* Contacts read view for everyone; inline admin editing (Task 2.2).
   The shared Zod schemas validate here just as they do on the server (#25). */

type ContactDraft = { name: string; role: string; email: string; phone: string; notes: string }

const blankContact: ContactDraft = { name: '', role: '', email: '', phone: '', notes: '' }

function draftOf(c?: ContactView): ContactDraft {
  return c
    ? { name: c.name, role: c.role ?? '', email: c.email ?? '', phone: c.phone ?? '', notes: c.notes ?? '' }
    : blankContact
}

// '' → null for nullish server fields; the wire schema accepts null, not '' (#25).
function nullify(d: Record<string, string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v === '' ? null : v]))
}

function issuesToFields(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const iss of issues) {
    const key = iss.path[0]
    if (typeof key === 'string' && !fields[key]) fields[key] = iss.message
  }
  return fields
}

function FieldError({ errors }: { errors: unknown[] }) {
  const first = errors.find(Boolean)
  return first ? <span className="field-error">{String(first)}</span> : null
}

function TextInput({
  value,
  onChange,
  label,
  type = 'text',
  errors,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  type?: string
  errors: unknown[]
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      <FieldError errors={errors} />
    </label>
  )
}

function ContactForm({ clientId, contact, onDone }: { clientId: string; contact?: ContactView; onDone: () => void }) {
  const form = useForm({
    defaultValues: draftOf(contact),
    validators: {
      onSubmit: ({ value }) => {
        // Create and update share the contact field schema; only their ids differ.
        const fields = issuesToFields(CreateContactInput.omit({ clientId: true }).safeParse(nullify(value)).error?.issues ?? [])
        return Object.keys(fields).length ? { fields } : undefined
      },
    },
    onSubmit: async ({ value }) => {
      try {
        const payload = {
          name: value.name,
          role: value.role === '' ? null : value.role,
          email: value.email === '' ? null : value.email,
          phone: value.phone === '' ? null : value.phone,
          notes: value.notes === '' ? null : value.notes,
        }
        if (contact) await updateContactFn({ data: { id: contact.id, ...payload } })
        else await createContactFn({ data: { clientId, ...payload } })
        onDone()
      } catch (e) {
        applyServerError(form, e)
      }
    },
  })
  return (
    <form
      className="contactform"
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      {(
        [
          ['name', 'Name', 'text'],
          ['role', 'Role', 'text'],
          ['email', 'Email', 'email'],
          ['phone', 'Phone', 'text'],
          ['notes', 'Notes', 'text'],
        ] as const
      ).map(([name, label, type]) => (
        <form.Field key={name} name={name}>
          {(f) => (
            <TextInput label={label} type={type} value={f.state.value} onChange={f.handleChange} errors={f.state.meta.errors} />
          )}
        </form.Field>
      ))}
      <div className="contactform-actions">
        <Button type="submit" variant="primary" size="sm">
          <Check size={13} /> {contact ? 'Save' : 'Add'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {String(form.state.errorMap.onServer ?? '') && (
        <p role="alert" className="form-error">
          {String(form.state.errorMap.onServer)}
        </p>
      )}
    </form>
  )
}

type DetailsDraft = {
  email: string
  phone: string
  website: string
  addressLine1: string
  addressLine2: string
  city: string
  region: string
  postcode: string
  country: string
  notes: string
}

const DETAILS_FIELDS: Array<[keyof DetailsDraft, string]> = [
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['website', 'Website'],
  ['addressLine1', 'Address line 1'],
  ['addressLine2', 'Address line 2'],
  ['city', 'City'],
  ['region', 'Region'],
  ['postcode', 'Postcode'],
  ['country', 'Country'],
  ['notes', 'Notes'],
]

function DetailsForm({ detail, onDone }: { detail: ClientDetail; onDone: () => void }) {
  const form = useForm({
    defaultValues: Object.fromEntries(DETAILS_FIELDS.map(([k]) => [k, detail[k] ?? ''])) as unknown as DetailsDraft,
    validators: {
      onSubmit: ({ value }) => {
        const fields = issuesToFields(UpdateClientDetailsInput.safeParse({ id: detail.id, ...nullify(value) }).error?.issues ?? [])
        return Object.keys(fields).length ? { fields } : undefined
      },
    },
    onSubmit: async ({ value }) => {
      try {
        await updateClientDetailsFn({ data: { id: detail.id, ...nullify(value) } })
        onDone()
      } catch (e) {
        applyServerError(form, e)
      }
    },
  })
  return (
    <form
      className="contactform"
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      {DETAILS_FIELDS.map(([k, label]) => (
        <form.Field key={k} name={k}>
          {(f) => <TextInput label={label} value={f.state.value} onChange={f.handleChange} errors={f.state.meta.errors} />}
        </form.Field>
      ))}
      <div className="contactform-actions">
        <Button type="submit" variant="primary" size="sm">
          <Check size={13} /> Save
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {String(form.state.errorMap.onServer ?? '') && (
        <p role="alert" className="form-error">
          {String(form.state.errorMap.onServer)}
        </p>
      )}
    </form>
  )
}

export function ContactsCard({ detail, isAdmin, refresh }: { detail: ClientDetail; isAdmin: boolean; refresh: () => Promise<void> }) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editingDetails, setEditingDetails] = useState(false)

  const address = [
    detail.addressLine1,
    detail.addressLine2,
    [detail.city, detail.region, detail.postcode].filter(Boolean).join(' '),
    detail.country,
  ].filter(Boolean) as string[]

  return (
    <section className="card contacts">
      <header className="card-head">
        <h2>Contacts</h2>
        {isAdmin && !adding && (
          <Button variant="ghost" size="sm" onClick={() => { setAdding(true); setEditing(null) }}>
            <Plus size={12} /> Add contact
          </Button>
        )}
      </header>
      {adding && <ContactForm clientId={detail.id} onDone={() => { setAdding(false); void refresh() }} />}
      <ul className="contactlist">
        {detail.contacts.map((c) => (
          <li key={c.id} className="contactrow">
            {editing === c.id ? (
              <ContactForm clientId={detail.id} contact={c} onDone={() => { setEditing(null); void refresh() }} />
            ) : (
              <>
                <div className="contact-main">
                  <b>{c.name}</b>{' '}
                  {c.isPrimary && <StatusChip kind="inverse">Primary</StatusChip>}{' '}
                  {c.role && <span className="contact-role">{c.role}</span>}
                  {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
                  {c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>}
                  {c.notes && <span className="contact-notes">{c.notes}</span>}
                </div>
                {isAdmin && (
                  <div className="contactactions">
                    {!c.isPrimary && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          void setPrimaryContactFn({ data: { id: c.id, clientId: detail.id } }).then(() => refresh())
                        }}
                      >
                        Make primary
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(c.id); setAdding(false) }}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="danger"
                      aria-label={`Archive ${c.name}`}
                      onClick={() => {
                        if (window.confirm(`Archive contact ${c.name}?`)) void archiveContactFn({ data: { id: c.id } }).then(() => refresh())
                      }}
                    >
                      <Trash2 size={13} /> Archive contact
                    </Button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
        {detail.contacts.length === 0 && <li className="lane-empty-note">No contacts yet.</li>}
      </ul>

      <div className="contactdetails">
        <header className="card-head">
          <h3>Details</h3>
          {isAdmin && (
            <Button variant="ghost" size="sm" onClick={() => setEditingDetails((v) => !v)}>
              {editingDetails ? 'Close' : 'Edit details'}
            </Button>
          )}
        </header>
        {editingDetails ? (
          <DetailsForm detail={detail} onDone={() => { setEditingDetails(false); void refresh() }} />
        ) : (
          <>
            {address.length > 0 && <p className="addr">{address.join(', ')}</p>}
            {detail.website && (
              <p className="addr">
                <a href={detail.website}>{detail.website}</a>
              </p>
            )}
            {detail.notes && <p className="addr contact-notes">{detail.notes}</p>}
          </>
        )}
      </div>
    </section>
  )
}
