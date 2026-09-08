import type { Flag } from '~/lib/redFlags'
import type { SessionContext } from '~/server/context'
import type { schema } from '~/server/db'
import type {
  ApproveWeekInput,
  GetWeekInput,
  ListMyWeeksInput,
  RejectWeekInput,
  SubmitWeekInput,
  UnlockWeekInput,
} from '~/lib/schemas/approvals'
import type { RoleRecon } from './reports'
import type { Deps } from './deps'

export type ApprovalRow = typeof schema.approvals.$inferSelect
export type ApprovalEventRow = typeof schema.approvalEvents.$inferSelect
export type ApprovalStatus = ApprovalRow['status']

/* State machine (#12, #26). Anything else → HttpError(409, 'INVALID_TRANSITION').
   none|draft|rejected --submit--> submitted
   submitted --approve--> approved      submitted --reject--> rejected
   approved --unlock(admin)--> draft    submitted --edit--> draft (guards/week.ts)
   approve/reject refuse ctx.workerId === workerId unless isAdmin(ctx): HttpError(409, 'SELF_APPROVAL').
   weekStart must be a Monday: HttpError(400, 'NOT_A_MONDAY', 'weekStart'). */

export type WeekIntervalAudit = {
  id: string
  jobName: string
  clientName: string
  startedAt: Date
  endedAt: Date
  minutes: number
  createdByName: string
  createdAt: Date
  editCount: number
}

export type WeekForApproval = {
  workerId: string
  workerName: string
  weekStart: string
  status: ApprovalStatus | 'none'
  recon: RoleRecon
  intervals: WeekIntervalAudit[]
  flags: Flag[]
  events: (ApprovalEventRow & { actorName: string })[]
}

export type PendingWeek = { workerId: string; workerName: string; weekStart: string; recon: RoleRecon; flagCount: number }
export type MyWeek = { workerId: string; weekStart: string; status: ApprovalStatus | 'none'; rejectedReason: string | null }

export async function submitWeek(_deps: Deps, _ctx: SessionContext, _input: SubmitWeekInput): Promise<ApprovalRow> {
  throw new Error('TODO Task 6.1')
}
export async function approveWeek(_deps: Deps, _ctx: SessionContext, _input: ApproveWeekInput): Promise<ApprovalRow> {
  throw new Error('TODO Task 6.1')
}
export async function rejectWeek(_deps: Deps, _ctx: SessionContext, _input: RejectWeekInput): Promise<ApprovalRow> {
  throw new Error('TODO Task 6.1')
}
export async function unlockWeek(_deps: Deps, _ctx: SessionContext, _input: UnlockWeekInput): Promise<ApprovalRow> {
  throw new Error('TODO Task 6.1')
}
export async function listPendingWeeks(_deps: Deps, _ctx: SessionContext): Promise<PendingWeek[]> {
  throw new Error('TODO Task 6.1')
}
export async function getWeekForApproval(_deps: Deps, _ctx: SessionContext, _input: GetWeekInput): Promise<WeekForApproval> {
  throw new Error('TODO Task 6.1')
}
export async function listMyWeeks(_deps: Deps, _ctx: SessionContext, _input: ListMyWeeksInput): Promise<MyWeek[]> {
  throw new Error('TODO Task 6.1')
}
