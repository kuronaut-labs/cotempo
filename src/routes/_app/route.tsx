import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router'
import { Button } from '~/components/ui/button'
import { authClient } from '~/lib/auth-client'
import { getSessionCtxFn, getSessionFn } from '~/server/fns/auth'

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    const [session, ctx] = await Promise.all([getSessionFn(), getSessionCtxFn()])
    if (!session) throw redirect({ to: '/login' })
    return { session, ctx }
  },
  component: AppLayout,
})

function AppLayout() {
  const { session, ctx } = Route.useRouteContext()
  const navigate = useNavigate()
  return (
    <div className="app-shell">
      <nav className="app-nav">
        <Link to="/today" activeProps={{ className: 'active' }}>
          Today
        </Link>
        <Link to="/reports" activeProps={{ className: 'active' }}>
          Reports
        </Link>
        <Link to="/approvals" activeProps={{ className: 'active' }}>
          Approvals
        </Link>
        {ctx?.roles.includes('admin') && (
          <Link to="/admin/clients" activeProps={{ className: 'active' }}>
            Admin
          </Link>
        )}
        <span className="nav-spacer" />
        <span className="nav-user">{session.name}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await authClient.signOut()
            navigate({ to: '/login' })
          }}
        >
          Sign out
        </Button>
      </nav>
      <Outlet />
    </div>
  )
}
