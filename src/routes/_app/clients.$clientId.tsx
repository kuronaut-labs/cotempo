import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router'
import { StructureTree } from '~/components/structureTree'
import { listStructureFn } from '~/server/fns/structure'
import { getTodayFn } from '~/server/fns/intervals'
import { listAssignmentsFn } from '~/server/fns/assignments'
import { listWorkersFn } from '~/server/fns/workers'

export const Route = createFileRoute('/_app/clients/$clientId')({
  loader: async ({ params }) => {
    const [tree, today, assignments, workers] = await Promise.all([
      listStructureFn({ data: { includeArchived: true } }),
      getTodayFn(),
      listAssignmentsFn({ data: {} }),
      listWorkersFn(),
    ])
    const client = tree.find((c) => c.id === params.clientId)
    if (!client) throw notFound()
    return { client, tree, today, assignments, workers }
  },
  component: ClientDetailPage,
})

function ClientDetailPage() {
  const router = useRouter()
  const { client, today, assignments, workers } = Route.useLoaderData()
  return (
    <main className="detail">
      <nav className="crumbs">
        <Link to="/clients">Clients</Link> / <span>{client.name}</span>
      </nav>
      <header className="admin-head">
        <h1>{client.name}</h1>
      </header>
      <StructureTree
        tree={[client]}
        manage="client"
        showArchived
        today={today.date}
        assignments={assignments}
        workers={workers}
        onRefresh={() => router.invalidate()}
      />
      {/* Contacts, figures and manager actions land in Waves 2–3. */}
    </main>
  )
}
