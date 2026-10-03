import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { EntityList, type EntityListRow } from '~/components/entityList'
import { listClientsFn } from '~/server/fns/clients'
import { getTodayFn } from '~/server/fns/intervals'

const search = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(['active', 'archived', 'all']).optional(),
  activeSince: z.string().optional(),
  sort: z.enum(['name', 'lastActivity', 'effort']).optional(),
})

export const Route = createFileRoute('/_app/clients')({
  validateSearch: search,
  loaderDeps: ({ search: s }) => ({ q: s.q ?? '', status: s.status ?? 'active', activeSince: s.activeSince ?? '', sort: s.sort ?? 'name' }),
  loader: async ({ deps }) => {
    const [first, today] = await Promise.all([
      listClientsFn({
        data: {
          q: deps.q || undefined,
          status: deps.status,
          activeSince: deps.activeSince || undefined,
          sort: deps.sort,
        },
      }),
      getTodayFn(),
    ])
    return { first, today, q: deps.q, status: deps.status, sort: deps.sort }
  },
  component: ClientsPage,
})

function ClientsPage() {
  const { first, today, q, status, sort } = Route.useLoaderData()
  const navigate = useNavigate()
  const set = (patch: Record<string, string | undefined>) =>
    navigate({ to: '/clients', search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }) })

  return (
    <main className="today">
      <header className="admin-head">
        <h1>Clients</h1>
        <span className="spacer" />
      </header>
      <EntityList
        rows={first.rows.map(
          (r): EntityListRow => ({
            id: r.id,
            name: r.name,
            archived: Boolean(r.archivedAt),
            count: r.liveProjectCount + (r.archivedAt ? Math.max(0, r.projectCount - r.liveProjectCount) : 0),
            countLabel: `project${r.projectCount === 1 ? '' : 's'}`,
            href: `/clients/${r.id}`,
            effortMin: r.effortMin,
            lastActivityMs: r.lastActivityMs,
            billableCents: 'billableCents' in r ? r.billableCents : undefined,
          }),
        )}
        nextCursor={first.nextCursor}
        loadMore={async (cursor) => {
          const next = await listClientsFn({
            data: { q: q || undefined, status, activeSince: undefined, sort, cursor },
          })
          return {
            rows: next.rows.map((r) => ({
              id: r.id,
              name: r.name,
              archived: Boolean(r.archivedAt),
              count: r.liveProjectCount,
              countLabel: `project${r.projectCount === 1 ? '' : 's'}`,
              href: `/clients/${r.id}`,
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
        sort={sort}
        onSort={(s) => set({ sort: s === 'name' ? undefined : s })}
        tz={today.tz}
        placeholder="Search clients"
        emptyText="No clients match"
      />
    </main>
  )
}
