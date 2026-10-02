import { createFileRoute, useRouter } from '@tanstack/react-router'
import { AgentForm, WorkerRoster } from '~/components/workerRoster'
import { InviteForm } from '~/components/inviteForm'
import { resendInviteFn } from '~/server/fns/invites'
import { listWorkersFn } from '~/server/fns/workers'
import { listPositionsFn } from '~/server/fns/positions'
import { listAssignmentsFn } from '~/server/fns/assignments'
import { listStructureFn } from '~/server/fns/structure'

export const Route = createFileRoute('/_app/admin/workers')({
  loader: async () => {
    const [workers, positions, assignments, structure] = await Promise.all([
      listWorkersFn(),
      listPositionsFn(),
      listAssignmentsFn({ data: {} }),
      listStructureFn({ data: {} }),
    ])
    return { workers, positions, assignments, structure }
  },
  component: WorkersPage,
})

function WorkersPage() {
  const { workers, positions, assignments, structure } = Route.useLoaderData()
  const router = useRouter()
  const refresh = () => router.invalidate()
  const resend = async (workerId: string) => {
    const { mailed } = await resendInviteFn({ data: { workerId } })
    return { mailed }
  }

  return (
    <>
      <header className="admin-head">
        <h1>Workers &amp; invites</h1>
      </header>
      <WorkerRoster workers={workers} positions={positions} assignments={assignments} structure={structure} onRefresh={refresh} onResend={resend} />
      <section className="panel">
        <h2 className="today-section-title">Invite a person</h2>
        <InviteForm workers={workers} positions={positions} onRefresh={refresh} />
      </section>
      <section className="panel">
        <h2 className="today-section-title">Add an AI assistant</h2>
        <AgentForm workers={workers} onRefresh={refresh} />
      </section>
    </>
  )
}
