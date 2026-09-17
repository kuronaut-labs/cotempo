import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Archive as ArchiveIcon, Check, Plus } from 'reicon-react'
import { Button } from '~/components/ui/button'
import { serverErrorMessage } from '~/components/forms/applyServerError'
import {
  archivePositionFn,
  createPositionFn,
  listPositionsFn,
  updatePositionFn,
} from '~/server/fns/positions'
import type { PositionView } from '~/server/fns/positions'
import { formatCents } from '~/lib/money'

export const Route = createFileRoute('/_app/admin/positions')({
  loader: async () => ({ positions: await listPositionsFn() }),
  component: PositionsPage,
})

function PositionsPage() {
  const { positions } = Route.useLoaderData() as { positions: PositionView[] }

  return (
    <main className="admin">
      <div className="admin-head">
        <h1>Positions</h1>
        <span className="spacer" />
        <label className="checkline">
          <input type="checkbox" checked readOnly /> Positions override the job rate for
          billable jobs
        </label>
      </div>
      {positions.map((p) => (
        <PositionCard key={p.id} position={p} />
      ))}
      <PositionCard position={null} />
    </main>
  )
}

// Editing state is local to the card; the rate is a $-per-hour text field converted on submit
function PositionCard({ position }: { position: PositionView | null }) {
  const isEdit = position !== null
  const router = useRouter()
  const [name, setName] = useState(position?.name ?? '')
  const [rate, setRate] = useState(position ? String(position.rateCents / 100) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const valid = name.trim().length > 0 && /^\d+(\.\d{1,2})?$/.test(rate)

  const submit = async () => {
    if (!valid) return
    setBusy(true)
    setError('')
    try {
      const rateCents = Math.round(Number(rate) * 100)
      if (isEdit) {
        await updatePositionFn({ data: { id: position.id, name: name.trim(), rateCents } })
      } else {
        await createPositionFn({ data: { name: name.trim(), rateCents } })
        setName('')
        setRate('')
      }
      await router.invalidate()
    } catch (e) {
      setError(serverErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const archive = async () => {
    if (!position) return
    setBusy(true)
    setError('')
    try {
      await archivePositionFn({ data: { id: position.id } })
      await router.invalidate()
    } catch (e) {
      setError(serverErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className={isEdit ? 'tree-client' : 'tree-add'}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="tree-row">
        <span className="name">{isEdit ? position.name : 'New position'}</span>
        {isEdit && (
          <>
            <span className="tree-rate">{formatCents(position.rateCents)} per hour</span>
            <span className="tree-actions">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="danger"
                disabled={busy}
                onClick={() => void archive()}
              >
                <ArchiveIcon size={13} /> Archive
              </Button>
            </span>
          </>
        )}
      </div>
      <div className="entryform-row">
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </label>
        <label className="field">
          <span>Rate per hour</span>
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="150"
            inputMode="decimal"
          />
        </label>
      </div>
      <div className="entryform-actions">
        <Button type="submit" variant="primary" disabled={busy || !valid}>
          {isEdit ? <Check size={14} /> : <Plus size={14} />} {isEdit ? 'Save' : 'Add position'}
        </Button>
      </div>
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </form>
  )
}
