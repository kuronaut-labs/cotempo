import { createServerFn } from '@tanstack/react-start'
import {
  AgentWorkerInput,
  ArchiveWorkerInput,
  SetRolesInput,
  SetSupervisorInput,
  UpdateAgentWorkerInput,
} from '~/lib/schemas/workers'
import { authMw, ctxOf } from '~/server/middleware/authMw'
import { requireRole } from '~/server/middleware/roleGuard'
import { runtimeDeps } from '~/server/runtimeDeps'
import * as svc from '~/server/services/workers'

export const listWorkersFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .handler(({ context }) => svc.listWorkers(runtimeDeps(), ctxOf(context)))

export const createAgentWorkerFn = createServerFn({ method: 'POST' })
  .middleware([authMw, requireRole('admin')])
  .validator(AgentWorkerInput)
  .handler(({ data, context }) => svc.createAgentWorker(runtimeDeps(), ctxOf(context), data))

export const updateAgentWorkerFn = createServerFn({ method: 'POST' })
  .middleware([authMw, requireRole('admin')])
  .validator(UpdateAgentWorkerInput)
  .handler(({ data, context }) => svc.updateAgentWorker(runtimeDeps(), ctxOf(context), data))

export const setRolesFn = createServerFn({ method: 'POST' })
  .middleware([authMw, requireRole('admin')])
  .validator(SetRolesInput)
  .handler(({ data, context }) => svc.setRoles(runtimeDeps(), ctxOf(context), data))

export const setSupervisorFn = createServerFn({ method: 'POST' })
  .middleware([authMw, requireRole('admin')])
  .validator(SetSupervisorInput)
  .handler(({ data, context }) => svc.setSupervisor(runtimeDeps(), ctxOf(context), data))

export const archiveWorkerFn = createServerFn({ method: 'POST' })
  .middleware([authMw, requireRole('admin')])
  .validator(ArchiveWorkerInput)
  .handler(({ data, context }) => svc.archiveWorker(runtimeDeps(), ctxOf(context), data))
