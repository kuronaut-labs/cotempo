import { createServerFn } from '@tanstack/react-start'
import { KpiInput, PeriodInput } from '~/lib/schemas/reports'
import { authMw, ctxOf } from '~/server/middleware/authMw'
import { requireRole } from '~/server/middleware/roleGuard'
import { runtimeDeps } from '~/server/runtimeDeps'
import * as svc from '~/server/services/reports'

export const reconciliationFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(PeriodInput)
  .handler(({ data, context }) => svc.reconciliation(runtimeDeps(), ctxOf(context), data))

export const dailyFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(PeriodInput)
  .handler(({ data, context }) => svc.daily(runtimeDeps(), ctxOf(context), data))

export const operatorLanesFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(PeriodInput)
  .handler(({ data, context }) => svc.operatorLanes(runtimeDeps(), ctxOf(context), data))

export const perJobFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(PeriodInput)
  .handler(({ data, context }) => svc.perJob(runtimeDeps(), ctxOf(context), data))

export const adminKpisFn = createServerFn({ method: 'GET' })
  .middleware([authMw, requireRole('billing', 'admin')])
  .validator(KpiInput)
  .handler(({ data, context }) => svc.adminKpis(runtimeDeps(), ctxOf(context), data))

export type {
  AdminKpis,
  ClientRecon,
  DailyReport,
  JobRecon,
  OperatorLane,
  ReconciliationReport,
  RoleRecon,
  TimeRecon,
} from '~/server/services/reports'
