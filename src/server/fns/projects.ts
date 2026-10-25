import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { ListProjectsInput } from '~/lib/schemas/projects'
import { authMw, ctxOf } from '~/server/middleware/authMw'
import { runtimeDeps } from '~/server/runtimeDeps'
import { getProject, listProjects, projectFigures } from '~/server/services/projects'

export const listProjectsFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(ListProjectsInput)
  .handler(({ data, context }) => listProjects(runtimeDeps(), ctxOf(context), data))

export const getProjectFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(({ data, context }) => getProject(runtimeDeps(), ctxOf(context), data))

export const projectFiguresFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(z.object({ id: z.string().min(1), from: z.iso.date().optional(), to: z.iso.date().optional() }))
  .handler(({ data, context }) => projectFigures(runtimeDeps(), ctxOf(context), data))

export type { ProjectDetail, ProjectFigures, ProjectListRow } from '~/server/services/projects'
