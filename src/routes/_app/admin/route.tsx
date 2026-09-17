import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'
import { getSessionCtxFn } from '~/server/fns/auth'

export const Route = createFileRoute('/_app/admin')({
  // UX gate only — every admin fn re-checks the role (#8/#10).
  beforeLoad: async () => {
    const ctx = await getSessionCtxFn()
    if (!ctx || !ctx.roles.includes('admin')) throw redirect({ to: '/today' })
    return { ctx }
  },
  component: AdminLayout,
})

function AdminLayout() {
  return (
    <div className="admin">
      <nav className="admin-subnav" aria-label="Admin sections">
        <Link to="/admin/clients" activeProps={{ className: 'active' }}>
          Clients
        </Link>
        <Link to="/admin/projects" activeProps={{ className: 'active' }}>
          Projects
        </Link>
        <Link to="/admin/jobs" activeProps={{ className: 'active' }}>
          Jobs
        </Link>
        <Link to="/admin/workers" activeProps={{ className: 'active' }}>
          Workers &amp; invites
        </Link>
        <Link to="/admin/leave" activeProps={{ className: 'active' }}>
          Leave types
        </Link>
        <Link to="/admin/positions" activeProps={{ className: 'active' }}>
          Positions
        </Link>
        <Link to="/admin/settings" activeProps={{ className: 'active' }}>
          Settings
        </Link>
      </nav>
      <Outlet />
    </div>
  )
}
