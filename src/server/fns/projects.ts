import { createServerFn } from '@tanstack/react-start'
import { ListProjectsInput } from '~/lib/schemas/projects'
import { authMw, ctxOf } from '~/server/middleware/authMw'
import { runtimeDeps } from '~/server/runtimeDeps'
import { listProjects } from '~/server/services/projects'

export const listProjectsFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(ListProjectsInput)
  .handler(({ data, context }) => listProjects(runtimeDeps(), ctxOf(context), data))
