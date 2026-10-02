import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { StructureTree } from '~/components/structureTree'
import { listStructureFn } from '~/server/fns/structure'
import { getTodayFn } from '~/server/fns/intervals'
import { listAssignmentsFn } from '~/server/fns/assignments'
import { listWorkersFn } from '~/server/fns/workers'

const search = z.object({ showArchived: z.boolean().optional() })

export const Route = createFileRoute('/_app/clients')({
  validateSearch: search,
  loaderDeps: ({ search: { showArchived } }) => ({ showArchived: showArchived ?? false }),
  loader: async ({ deps }) => {
    const [tree, today, assignments, workers] = await Promise.all([
      listStructureFn({ data: { includeArchived: deps.showArchived } }),
      getTodayFn(),
      listAssignmentsFn({ data: {} }),
      listWorkersFn(),
    ])
    return { tree, today, assignments, workers }
  },
  component: ClientsPage,
})

function ClientsPage() {
  const { tree, today, assignments, workers } = Route.useLoaderData()
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
            onChange={(e) => navigate({ to: '/clients', search: { showArchived: e.target.checked } })}
          />
          Show archived
        </label>
      </header>
      <StructureTree
        tree={tree}
        manage="client"
        showArchived={showArchived}
        today={today.date}
        assignments={assignments}
        workers={workers}
        onRefresh={() => router.invalidate()}
      />
    </>
  )
}
