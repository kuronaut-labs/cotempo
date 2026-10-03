import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { EntityList, type EntityListRow } from '~/components/entityList'
import { listProjectsFn } from '~/server/fns/projects'
import { listClientsFn } from '~/server/fns/clients'
import { getTodayFn } from '~/server/fns/intervals'

const search = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(['active', 'archived', 'all']).optional(),
  activeSince: z.string().optional(),
  sort: z.enum(['name', 'lastActivity', 'effort']).optional(),
  clientId: z.string().optional(),
  due: z.enum(['overdue', 'soon', 'none', 'any']).optional(),
})

export const Route = createFileRoute('/_app/projects')({
  validateSearch: search,
  loaderDeps: ({ search: s }) => ({
    q: s.q ?? '',
    status: s.status ?? 'active',
    activeSince: s.activeSince ?? '',
    sort: s.sort ?? 'name',
    clientId: s.clientId ?? '',
    due: s.due ?? 'any',
  }),
  loader: async ({ deps }) => {
    const [first, today, clients] = await Promise.all([
      listProjectsFn({
        data: {
          q: deps.q || undefined,
          status: deps.status,
          activeSince: deps.activeSince || undefined,
          sort: deps.sort,
          clientId: deps.clientId || undefined,
          due: deps.due,
        },
      }),
      getTodayFn(),
      listClientsFn({ data: { limit: 200 } }),
    ])
    return { first, today, clients, q: deps.q, status: deps.status, sort: deps.sort, clientId: deps.clientId, due: deps.due }
  },
  component: ProjectsPage,
})

const DUE_LABEL: Record<string, string> = { any: 'Any due', overdue: 'Overdue', soon: 'Due soon', none: 'No due date' }

function ProjectsPage() {
  const { first, today, clients, q, status, sort, clientId, due } = Route.useLoaderData()
  const navigate = useNavigate()
  const set = (patch: Record<string, string | undefined>) =>
    navigate({ to: '/projects', search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }) })

  return (
    <main className="today">
      <header className="admin-head">
        <h1>Projects</h1>
        <span className="spacer" />
      </header>
      <EntityList
        rows={first.rows.map(
          (r): EntityListRow => ({
            id: r.id,
            name: r.name,
            archived: Boolean(r.archivedAt),
            count: r.liveJobCount,
            countLabel: `job${r.jobCount === 1 ? '' : 's'}`,
            href: `/projects/${r.id}`,
            effortMin: r.effortMin,
            lastActivityMs: r.lastActivityMs,
            billableCents: 'billableCents' in r ? r.billableCents : undefined,
          }),
        )}
        nextCursor={first.nextCursor}
        loadMore={async (cursor) => {
          const next = await listProjectsFn({
            data: { q: q || undefined, status, sort, clientId: clientId || undefined, due, cursor },
          })
          return {
            rows: next.rows.map((r) => ({
              id: r.id,
              name: r.name,
              archived: Boolean(r.archivedAt),
              count: r.liveJobCount,
              countLabel: `job${r.jobCount === 1 ? '' : 's'}`,
              href: `/projects/${r.id}`,
              effortMin: r.effortMin,
              lastActivityMs: r.lastActivityMs,
              billableCents: 'billableCents' in r ? r.billableCents : undefined,
            })),
            nextCursor: next.nextCursor,
          }
        }}
        q={q}
        onQuery={(next) => set({ q: next || undefined })}
        status={status}
        onStatus={(s) => set({ status: s === 'active' ? undefined : s })}
        filters={[
          { key: 'client-all', label: 'Client: all', active: !clientId, onSelect: () => set({ clientId: undefined }) },
          ...clients.rows
            .slice(0, 6)
            .map((c) => ({
              key: `client-${c.id}`,
              label: c.name,
              active: clientId === c.id,
              onSelect: () => set({ clientId: clientId === c.id ? undefined : c.id }),
            })),
          { key: 'due', label: DUE_LABEL[due] ?? 'Any due', active: due !== 'any', onSelect: () => set({ due: { overdue: 'soon', soon: 'none', none: 'any', any: 'overdue' }[due] ?? 'overdue' }) },
        ]}
        sort={sort}
        onSort={(s) => set({ sort: s === 'name' ? undefined : s })}
        tz={today.tz}
        placeholder="Search projects"
        emptyText="No projects match"
      />
    </main>
  )
}
