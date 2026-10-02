import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMw, ctxOf } from '~/server/middleware/authMw'
import { runtimeDeps } from '~/server/runtimeDeps'
import * as svc from '~/server/services/allocations'

export type { AllocationRow } from '~/server/services/allocations'

export const allocationReportFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(z.object({ workerId: z.string().min(1).optional() }))
  .handler(({ data, context }) => svc.allocationReport(runtimeDeps(), ctxOf(context), data))
