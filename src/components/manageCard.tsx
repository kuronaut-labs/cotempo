import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { serverErrorMessage } from '~/components/forms/applyServerError'
import {
  archiveClientFn,
  archiveProjectFn,
  createProjectFn,
  unarchiveClientFn,
  unarchiveProjectFn,
  updateClientFn,
  updateProjectFn,
} from '~/server/fns/structure'

/* Admin actions on entity detail pages: rename, (un)archive, add-project (client). */

export function ManageCard({
  kind,
  id,
  name,
  archivedAt,
  refresh,
}: {
  kind: 'client' | 'project'
  id: string
  name: string
  archivedAt: string | Date | null
  refresh: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [rename, setRename] = useState(name)
  const [addingProject, setAddingProject] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [error, setError] = useState<string | null>(null)

  const attempt = async (doIt: () => Promise<unknown>) => {
    try {
      await doIt()
      setError(null)
      setRenaming(false)
      setAddingProject(false)
      refresh()
    } catch (e) {
      setError(serverErrorMessage(e))
    }
  }

  const updateFn = kind === 'client' ? updateClientFn : updateProjectFn
  const archiveFn = kind === 'client' ? archiveClientFn : archiveProjectFn
  const unarchiveFn = kind === 'client' ? unarchiveClientFn : unarchiveProjectFn

  return (
    <section className="card manage">
      <header className="card-head">
        <h2>Manage</h2>
      </header>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {renaming ? (
        <form
          className="tree-edit"
          onSubmit={(e) => {
            e.preventDefault()
            if (!rename.trim()) return
            void attempt(() => updateFn({ data: { id, name: rename.trim() } }))
          }}
        >
          <input value={rename} onChange={(e) => setRename(e.target.value)} aria-label="Name" />
          <Button type="submit" variant="primary" size="sm">
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRenaming(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="manage-actions">
          <Button variant="ghost" size="sm" onClick={() => { setRename(name); setRenaming(true) }}>
            Rename
          </Button>
          {archivedAt ? (
            <Button variant="secondary" size="sm" onClick={() => void attempt(() => unarchiveFn({ data: { id } }))}>
              Unarchive
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="danger"
              onClick={() => {
                if (window.confirm(`Archive ${kind} ${name}?`)) void attempt(() => archiveFn({ data: { id } }))
              }}
            >
              Archive
            </Button>
          )}
        </div>
      )}
      {kind === 'client' && !archivedAt ? (
        addingProject ? (
          <form
            className="tree-edit"
            onSubmit={(e) => {
              e.preventDefault()
              if (!projectName.trim()) return
              void attempt(() =>
                createProjectFn({ data: { clientId: id, name: projectName.trim(), ...(dueOn !== '' ? { dueOn } : {}) } }),
              )
            }}
          >
            <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Project name" aria-label="Project name" />
            <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} aria-label="Due date" />
            <Button type="submit" variant="primary" size="sm">
              Add
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAddingProject(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setAddingProject(true)}>
            Add project
          </Button>
        )
      ) : null}
      {archivedAt ? <p className="status-msg">Archived on {String(archivedAt).slice(0, 10)}</p> : null}
    </section>
  )
}
