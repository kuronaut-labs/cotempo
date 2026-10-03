import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router'
import { ContactsCard } from '~/components/contactsCard'
import { ManageCard } from '~/components/manageCard'
import { StatusChip } from '~/components/ui/chip'
import { getClientFn, type ClientDetail } from '~/server/fns/clients'
import { getSessionCtxFn } from '~/server/fns/auth'

export const Route = createFileRoute('/_app/clients/$clientId')({
  loader: async ({ params }) => {
    const [detail, ctx] = await Promise.all([getClientFn({ data: { id: params.clientId } }), getSessionCtxFn()])
    return { detail, isAdmin: ctx?.roles.includes('admin') ?? false }
  },
  onError: () => {
    throw notFound()
  },
  component: ClientDetailPage,
})

function ClientDetailPage() {
  const router = useRouter()
  const { detail, isAdmin } = Route.useLoaderData()
  const refresh = () => router.invalidate()
  return (
    <main className="detail">
      <nav className="crumbs">
        <Link to="/clients">Clients</Link> / <span>{detail.name}</span>
      </nav>
      <header className="admin-head">
        <h1>{detail.name}</h1>
        <StatusChip kind={detail.archivedAt ? 'error' : 'success'}>{detail.archivedAt ? 'Archived' : 'Live'}</StatusChip>
      </header>
      {detail.archivedAt ? <p className="status-msg">Archived on {String(detail.archivedAt).slice(0, 10)}</p> : null}
      <div className="detail-grid">
        <ContactsCard detail={detail as ClientDetail} isAdmin={isAdmin} refresh={refresh} />
        <section className="card client-figures">{/* Client figures land in Task 2.3. */}</section>
      </div>
      {isAdmin && <ManageCard kind="client" id={detail.id} name={detail.name} archivedAt={detail.archivedAt} refresh={refresh} />}
    </main>
  )
}
