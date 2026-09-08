import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router'
import { authClient } from '~/lib/auth-client'
import { getSessionFn } from '~/server/fns/auth'

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    const session = await getSessionFn()
    if (!session) throw redirect({ to: '/login' })
    return { session }
  },
  component: AppLayout,
})

function AppLayout() {
  const { session } = Route.useRouteContext()
  const navigate = useNavigate()
  return (
    <div className="app-shell">
      <nav className="app-nav">
        <Link to="/today" activeProps={{ className: 'active' }}>
          Today
        </Link>
        {/* Reports, Approvals, Admin land in Phases 5–8. */}
        <span className="nav-spacer" />
        <span className="nav-user">{session.name}</span>
        <button
          onClick={async () => {
            await authClient.signOut()
            navigate({ to: '/login' })
          }}
        >
          Sign out
        </button>
      </nav>
      <Outlet />
    </div>
  )
}
