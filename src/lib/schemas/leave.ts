import { z } from 'zod'

export const AccrualMethodEnum = z.enum(['annual_allotment', 'monthly_prorata', 'per_hours_worked'])
export type AccrualMethod = z.infer<typeof AccrualMethodEnum>

export const YearBasisEnum = z.enum(['calendar', 'anniversary'])
export type YearBasis = z.infer<typeof YearBasisEnum>

const dayIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const minutes = (min: number, max: number) => z.number().int().min(min).max(max)

export const LeaveTypeInput = z.object({
  id: z.string().min(1).optional(),
  key: z.string().regex(/^[a-z0-9-]{1,40}$/, 'lowercase letters, digits, dashes'),
  name: z.string().min(1).max(100),
  paid: z.boolean(),
  accrualMethod: AccrualMethodEnum,
  minutesPerYear: minutes(0, 100_000),
  accrualRatePer10k: minutes(0, 10_000),
  maxCarryOverMinutes: minutes(0, 100_000),
  yearBasis: YearBasisEnum,
})
export type LeaveTypeInput = z.infer<typeof LeaveTypeInput>

export const LeaveRequestInput = z
  .object({
    workerId: z.string().min(1).optional(),
    typeId: z.string().min(1),
    startDay: dayIso,
    endDay: dayIso,
    minutesPerDay: minutes(15, 720),
    reason: z.string().max(500).optional(),
  })
  .refine((v) => v.endDay >= v.startDay, { message: 'Ends before it starts', path: ['endDay'] })
export type LeaveRequestInput = z.infer<typeof LeaveRequestInput>

export const ApproveLeaveInput = z.object({ id: z.string().min(1), comment: z.string().max(500).optional() })
export type ApproveLeaveInput = z.infer<typeof ApproveLeaveInput>

export const RejectLeaveInput = z.object({ id: z.string().min(1), reason: z.string().min(1).max(500) })
export type RejectLeaveInput = z.infer<typeof RejectLeaveInput>

export const CancelLeaveInput = z.object({ id: z.string().min(1) })
export type CancelLeaveInput = z.infer<typeof CancelLeaveInput>
