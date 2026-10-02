import { z } from 'zod'

const target = { targetKind: z.enum(['project', 'job']), targetId: z.string().min(1) }
const allocatedMinutes = z.number().int().min(0).max(100_000).nullish()

export const CreateAssignmentInput = z.object({ workerId: z.string().min(1), ...target, allocatedMinutes, note: z.string().max(500).nullish() })
export const UpdateAssignmentInput = z.object({ id: z.string().min(1), allocatedMinutes, note: z.string().max(500).nullish() })
export const ArchiveAssignmentInput = z.object({ id: z.string().min(1) })
export const ListAssignmentsInput = z.object({
  workerId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
})

export type CreateAssignmentInput = z.infer<typeof CreateAssignmentInput>
export type UpdateAssignmentInput = z.infer<typeof UpdateAssignmentInput>
export type ArchiveAssignmentInput = z.infer<typeof ArchiveAssignmentInput>
export type ListAssignmentsInput = z.infer<typeof ListAssignmentsInput>
