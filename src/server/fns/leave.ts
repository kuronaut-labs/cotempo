import { createServerFn } from '@tanstack/react-start'
import {
  ApproveLeaveInput,
  CancelLeaveInput,
  LeaveRequestInput,
  RejectLeaveInput,
  LeaveTypeInput,
} from '~/lib/schemas/leave'
import { PeriodInput } from '~/lib/schemas/reports'
import { authMw, ctxOf } from '~/server/middleware/authMw'
import { runtimeDeps } from '~/server/runtimeDeps'
import * as svc from '~/server/services/leave'

export const listLeaveTypesFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .handler(({ context }) => svc.listLeaveTypes(runtimeDeps(), ctxOf(context)))

export const upsertLeaveTypeFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(LeaveTypeInput)
  .handler(({ data, context }) => svc.upsertLeaveType(runtimeDeps(), ctxOf(context), data))

export const myLeaveFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .handler(({ context }) => svc.myLeave(runtimeDeps(), ctxOf(context)))

export const submitLeaveRequestFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(LeaveRequestInput)
  .handler(({ data, context }) => svc.submitLeaveRequest(runtimeDeps(), ctxOf(context), data))

export const cancelLeaveRequestFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(CancelLeaveInput)
  .handler(({ data, context }) => svc.cancelLeaveRequest(runtimeDeps(), ctxOf(context), data))

export const approveLeaveRequestFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(ApproveLeaveInput)
  .handler(({ data, context }) => svc.approveLeaveRequest(runtimeDeps(), ctxOf(context), data))

export const rejectLeaveRequestFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(RejectLeaveInput)
  .handler(({ data, context }) => svc.rejectLeaveRequest(runtimeDeps(), ctxOf(context), data))

export const leaveQueueFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .handler(({ context }) => svc.leaveQueue(runtimeDeps(), ctxOf(context)))

export const leaveReportFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(PeriodInput)
  .handler(({ data, context }) => svc.leaveReport(runtimeDeps(), ctxOf(context), data))

export type {
  LeaveBalanceView,
  LeaveReportView,
  LeaveRequestView,
  LeaveTypeView,
} from '~/server/services/leave'
