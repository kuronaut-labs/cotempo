import { createServerFn } from '@tanstack/react-start'
import {
  ArchiveInput,
  CreateClientInput,
  CreateJobInput,
  CreateProjectInput,
  ListStructureInput,
  UpdateClientInput,
  UpdateJobInput,
  UpdateProjectInput,
} from '~/lib/schemas/structure'
import { authMw, ctxOf } from '~/server/middleware/authMw'
import { requireRole } from '~/server/middleware/roleGuard'
import { runtimeDeps } from '~/server/runtimeDeps'
import * as svc from '~/server/services/structure'

const adminOnly = [authMw, requireRole('admin')]

export const listStructureFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(ListStructureInput)
  .handler(({ data, context }) => svc.listStructure(runtimeDeps(), ctxOf(context), data))

export const createClientFn = createServerFn({ method: 'POST' })
  .middleware(adminOnly)
  .validator(CreateClientInput)
  .handler(({ data, context }) => svc.createClient(runtimeDeps(), ctxOf(context), data))

export const updateClientFn = createServerFn({ method: 'POST' })
  .middleware(adminOnly)
  .validator(UpdateClientInput)
  .handler(({ data, context }) => svc.updateClient(runtimeDeps(), ctxOf(context), data))

export const archiveClientFn = createServerFn({ method: 'POST' })
  .middleware(adminOnly)
  .validator(ArchiveInput)
  .handler(({ data, context }) => svc.archiveClient(runtimeDeps(), ctxOf(context), data))

export const createProjectFn = createServerFn({ method: 'POST' })
  .middleware(adminOnly)
  .validator(CreateProjectInput)
  .handler(({ data, context }) => svc.createProject(runtimeDeps(), ctxOf(context), data))

export const updateProjectFn = createServerFn({ method: 'POST' })
  .middleware(adminOnly)
  .validator(UpdateProjectInput)
  .handler(({ data, context }) => svc.updateProject(runtimeDeps(), ctxOf(context), data))

export const archiveProjectFn = createServerFn({ method: 'POST' })
  .middleware(adminOnly)
  .validator(ArchiveInput)
  .handler(({ data, context }) => svc.archiveProject(runtimeDeps(), ctxOf(context), data))

export const createJobFn = createServerFn({ method: 'POST' })
  .middleware(adminOnly)
  .validator(CreateJobInput)
  .handler(({ data, context }) => svc.createJob(runtimeDeps(), ctxOf(context), data))

export const updateJobFn = createServerFn({ method: 'POST' })
  .middleware(adminOnly)
  .validator(UpdateJobInput)
  .handler(({ data, context }) => svc.updateJob(runtimeDeps(), ctxOf(context), data))

export const archiveJobFn = createServerFn({ method: 'POST' })
  .middleware(adminOnly)
  .validator(ArchiveInput)
  .handler(({ data, context }) => svc.archiveJob(runtimeDeps(), ctxOf(context), data))
