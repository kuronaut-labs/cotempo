import { createFileRoute, useRouter } from '@tanstack/react-router'
import { AgentForm, WorkerRoster } from '~/components/workerRoster'
import { InviteForm } from '~/components/inviteForm'
import { resendInviteFn } from '~/server/fns/invites'
import { listWorkersFn } from '~/server/fns/workers'

export const Route = createFileRoute('/_app/admin/workers')({
  loader: async () => ({ workers: await listWorkersFn() }),
  component: WorkersPage,
})

function WorkersPage() {
  const { workers } = Route.useLoaderData()
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
      <WorkerRoster workers={workers} onRefresh={refresh} onResend={resend} />
      <section className="panel">
        <h2 className="today-section-title">Invite a person</h2>
        <InviteForm workers={workers} onRefresh={refresh} />
      </section>
      <section className="panel">
        <h2 className="today-section-title">Register an agent worker</h2>
        <AgentForm workers={workers} onRefresh={refresh} />
      </section>
    </>
  )
}
