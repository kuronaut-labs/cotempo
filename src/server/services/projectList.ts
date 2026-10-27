import type { ListProjectsInput } from '~/lib/schemas/projects'
import type { SessionContext } from '~/server/context'
import { listProjects, type ProjectListRow } from './projects'
import type { Deps } from './deps'

/** Every matching project, sorted, across all pages — for detail pages that must not stop at a page limit. */
export async function allProjects(
  deps: Deps,
  ctx: SessionContext,
  input: Omit<ListProjectsInput, 'cursor' | 'limit'>,
): Promise<ProjectListRow[]> {
  const rows: ProjectListRow[] = []
  let cursor: string | undefined
  do {
    const page = await listProjects(deps, ctx, { ...input, limit: 200, cursor })
    rows.push(...page.rows)
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  return rows
}
