import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { StructureTree } from '~/components/structureTree'
import { listStructureFn } from '~/server/fns/structure'

const search = z.object({ showArchived: z.boolean().optional() })

export const Route = createFileRoute('/_app/admin/clients')({
  validateSearch: search,
  loaderDeps: ({ search: { showArchived } }) => ({ showArchived: showArchived ?? false }),
  loader: async ({ deps }) => ({ tree: await listStructureFn({ data: { includeArchived: deps.showArchived } }) }),
  component: ClientsPage,
})

function ClientsPage() {
  const { tree } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  const showArchived = search.showArchived ?? false

  return (
    <>
      <header className="admin-head">
        <h1>Clients</h1>
        <span className="spacer" />
        <label className="checkline">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => navigate({ to: '/admin/clients', search: { showArchived: e.target.checked } })}
          />
          Show archived
        </label>
      </header>
      <StructureTree tree={tree} manage="client" showArchived={showArchived} onRefresh={() => router.invalidate()} />
    </>
  )
}
