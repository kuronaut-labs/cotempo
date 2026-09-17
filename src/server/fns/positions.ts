import { createServerFn } from '@tanstack/react-start'
import {
  ArchivePositionInput, PositionInput, SetWorkerPositionInput, UpdatePositionInput,
} from '~/lib/schemas/positions'
import { authMw, ctxOf } from '~/server/middleware/authMw'
import { requireRole } from '~/server/middleware/roleGuard'
import { runtimeDeps } from '~/server/runtimeDeps'
import * as svc from '~/server/services/positions'

export const listPositionsFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .handler(({ context }) => svc.listPositions(runtimeDeps(), ctxOf(context)))

export const createPositionFn = createServerFn({ method: 'POST' })
  .middleware([authMw, requireRole('admin')])
  .validator(PositionInput)
  .handler(({ data, context }) => svc.createPosition(runtimeDeps(), ctxOf(context), data))

export const updatePositionFn = createServerFn({ method: 'POST' })
  .middleware([authMw, requireRole('admin')])
  .validator(UpdatePositionInput)
  .handler(({ data, context }) => svc.updatePosition(runtimeDeps(), ctxOf(context), data))

export const archivePositionFn = createServerFn({ method: 'POST' })
  .middleware([authMw, requireRole('admin')])
  .validator(ArchivePositionInput)
  .handler(({ data, context }) => svc.archivePosition(runtimeDeps(), ctxOf(context), data))

export const setWorkerPositionFn = createServerFn({ method: 'POST' })
  .middleware([authMw, requireRole('admin')])
  .validator(SetWorkerPositionInput)
  .handler(({ data, context }) => svc.setWorkerPosition(runtimeDeps(), ctxOf(context), data))

export type { PositionView } from '~/server/services/positions'
