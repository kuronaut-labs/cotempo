import { createServerFn } from '@tanstack/react-start'
import {
  ApproveWeekInput,
  GetWeekInput,
  ListMyWeeksInput,
  RejectWeekInput,
  SubmitWeekInput,
  UnlockWeekInput,
} from '~/lib/schemas/approvals'
import { authMw, ctxOf } from '~/server/middleware/authMw'
import { runtimeDeps } from '~/server/runtimeDeps'
import * as svc from '~/server/services/approvals'

export const submitWeekFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(SubmitWeekInput)
  .handler(({ data, context }) => svc.submitWeek(runtimeDeps(), ctxOf(context), data))

export const approveWeekFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(ApproveWeekInput)
  .handler(({ data, context }) => svc.approveWeek(runtimeDeps(), ctxOf(context), data))

export const rejectWeekFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(RejectWeekInput)
  .handler(({ data, context }) => svc.rejectWeek(runtimeDeps(), ctxOf(context), data))

export const unlockWeekFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(UnlockWeekInput)
  .handler(({ data, context }) => svc.unlockWeek(runtimeDeps(), ctxOf(context), data))

export const listPendingWeeksFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .handler(({ context }) => svc.listPendingWeeks(runtimeDeps(), ctxOf(context)))

export const getWeekForApprovalFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(GetWeekInput)
  .handler(({ data, context }) => svc.getWeekForApproval(runtimeDeps(), ctxOf(context), data))

export const listMyWeeksFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(ListMyWeeksInput)
  .handler(({ data, context }) => svc.listMyWeeks(runtimeDeps(), ctxOf(context), data))

export type {
  ApprovalEventRow,
  ApprovalRow,
  ApprovalStatus,
  MyWeek,
  PendingWeek,
  WeekForApproval,
  WeekIntervalAudit,
} from '~/server/services/approvals'
