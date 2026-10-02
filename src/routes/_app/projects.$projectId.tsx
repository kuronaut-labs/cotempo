import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { listStructureFn } from '~/server/fns/structure'
import type { ClientNode, ProjectNode } from '~/server/services/structure'

export const Route = createFileRoute('/_app/projects/$projectId')({
  loader: async ({ params }) => {
    const tree = await listStructureFn({ data: { includeArchived: true } })
    for (const client of tree) {
      const project = client.projects.find((p) => p.id === params.projectId)
      if (project) return { client, project }
    }
    throw notFound()
  },
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { client, project } = Route.useLoaderData() as { client: ClientNode; project: ProjectNode }
  return (
    <main className="detail">
      <nav className="crumbs">
        <Link to="/projects">Projects</Link> /{' '}
        <Link to="/clients/$clientId" params={{ clientId: client.id }}>
          {client.name}
        </Link>{' '}
        / <span>{project.name}</span>
      </nav>
      <header className="admin-head">
        <h1>{project.name}</h1>
      </header>
      <ul className="joblist">
        {project.jobs.map((j) => (
          <li key={j.id}>
            {j.name}
            {j.archivedAt ? ' (archived)' : ''}
          </li>
        ))}
      </ul>
      {/* Figures and admin cards land in Wave 3. */}
    </main>
  )
}
