import { z } from 'zod'

const WeekTarget = z.object({ workerId: z.string().min(1), weekStart: z.iso.date() })

export const SubmitWeekInput = WeekTarget
export const ApproveWeekInput = WeekTarget.extend({ comment: z.string().max(500).optional() })
export const RejectWeekInput = WeekTarget.extend({ reason: z.string().min(1).max(500) })
export const UnlockWeekInput = WeekTarget.extend({ reason: z.string().min(1).max(500) })
export const GetWeekInput = WeekTarget
export const ListMyWeeksInput = z.object({ weeks: z.number().int().min(1).max(26).default(8) })

export type SubmitWeekInput = z.infer<typeof SubmitWeekInput>
export type ApproveWeekInput = z.infer<typeof ApproveWeekInput>
export type RejectWeekInput = z.infer<typeof RejectWeekInput>
export type UnlockWeekInput = z.infer<typeof UnlockWeekInput>
export type GetWeekInput = z.infer<typeof GetWeekInput>
export type ListMyWeeksInput = z.infer<typeof ListMyWeeksInput>
