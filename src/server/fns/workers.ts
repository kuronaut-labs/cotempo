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
import { getDb } from '~/server/db'
import { getEnv } from '~/server/env'
import * as svc from '~/server/services/workers'

const deps = () => ({ db: getDb(), tz: getEnv().ORG_TIMEZONE, now: () => new Date() })

export const listWorkersFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .handler(({ context }) => svc.listWorkers(deps(), ctxOf(context)))

export const createAgentWorkerFn = createServerFn({ method: 'POST' })
  .middleware([authMw, requireRole('admin')])
  .validator(AgentWorkerInput)
  .handler(({ data, context }) => svc.createAgentWorker(deps(), ctxOf(context), data))

export const updateAgentWorkerFn = createServerFn({ method: 'POST' })
  .middleware([authMw, requireRole('admin')])
  .validator(UpdateAgentWorkerInput)
  .handler(({ data, context }) => svc.updateAgentWorker(deps(), ctxOf(context), data))

export const setRolesFn = createServerFn({ method: 'POST' })
  .middleware([authMw, requireRole('admin')])
  .validator(SetRolesInput)
  .handler(({ data, context }) => svc.setRoles(deps(), ctxOf(context), data))

export const setSupervisorFn = createServerFn({ method: 'POST' })
  .middleware([authMw, requireRole('admin')])
  .validator(SetSupervisorInput)
  .handler(({ data, context }) => svc.setSupervisor(deps(), ctxOf(context), data))

export const archiveWorkerFn = createServerFn({ method: 'POST' })
  .middleware([authMw, requireRole('admin')])
  .validator(ArchiveWorkerInput)
  .handler(({ data, context }) => svc.archiveWorker(deps(), ctxOf(context), data))
