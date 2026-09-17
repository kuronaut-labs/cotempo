import { z } from 'zod'

export const PositionInput = z.object({
  name: z.string().min(1).max(100),
  rateCents: z.number().int().min(0).max(10_000_000),
})
export type PositionInput = z.infer<typeof PositionInput>

export const UpdatePositionInput = PositionInput.partial().extend({
  id: z.string().min(1),
})
export type UpdatePositionInput = z.infer<typeof UpdatePositionInput>

export const ArchivePositionInput = z.object({ id: z.string().min(1) })
export type ArchivePositionInput = z.infer<typeof ArchivePositionInput>

export const SetWorkerPositionInput = z.object({
  workerId: z.string().min(1),
  positionId: z.string().min(1).nullable(),
})
export type SetWorkerPositionInput = z.infer<typeof SetWorkerPositionInput>
