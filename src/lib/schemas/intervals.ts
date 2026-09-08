import { z } from 'zod'

const minuteAligned = z.iso.datetime().refine((s) => Date.parse(s) % 60_000 === 0, { message: 'MINUTE_ALIGNMENT' })

export const CreateIntervalInput = z
  .object({
    workerId: z.string().min(1),
    jobId: z.string().min(1),
    startedAt: minuteAligned,
    endedAt: minuteAligned,
    note: z.string().max(500).optional(),
  })
  .refine((v) => Date.parse(v.endedAt) > Date.parse(v.startedAt), { message: 'END_BEFORE_START', path: ['endedAt'] })

export const UpdateIntervalInput = z
  .object({
    id: z.string().min(1),
    startedAt: minuteAligned.optional(),
    endedAt: minuteAligned.optional(),
    jobId: z.string().min(1).optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .refine((v) => !(v.startedAt && v.endedAt) || Date.parse(v.endedAt) > Date.parse(v.startedAt), {
    message: 'END_BEFORE_START',
    path: ['endedAt'],
  })

export const DeleteIntervalInput = z.object({ id: z.string().min(1) })
export const DayQuery = z.object({ date: z.iso.date(), workerId: z.string().min(1).optional() })
export const ListIntervalsInput = z.object({
  workerId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
})

export type CreateIntervalInput = z.infer<typeof CreateIntervalInput>
export type UpdateIntervalInput = z.infer<typeof UpdateIntervalInput>
export type DeleteIntervalInput = z.infer<typeof DeleteIntervalInput>
export type DayQuery = z.infer<typeof DayQuery>
export type ListIntervalsInput = z.infer<typeof ListIntervalsInput>
