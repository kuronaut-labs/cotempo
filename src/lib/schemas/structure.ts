import { z } from 'zod'

const name = z.string().min(1).max(100)
// null = non-billable, 0 = billable at $0 (#18); omitted in create = org default
const rate = z.number().int().min(0).nullable()
const createRate = z.number().int().min(0).nullish()

export const CreateClientInput = z.object({ name })
export const UpdateClientInput = z.object({ id: z.string().min(1), name })
export const CreateProjectInput = z.object({ clientId: z.string().min(1), name })
export const UpdateProjectInput = z.object({ id: z.string().min(1), name })
export const CreateJobInput = z.object({ projectId: z.string().min(1), name, billableRateCents: createRate })
export const UpdateJobInput = z.object({ id: z.string().min(1), name: name.optional(), billableRateCents: rate.optional() })
export const ArchiveInput = z.object({ id: z.string().min(1) })
export const ListStructureInput = z.object({ includeArchived: z.boolean().default(false) })

export type CreateClientInput = z.infer<typeof CreateClientInput>
export type UpdateClientInput = z.infer<typeof UpdateClientInput>
export type CreateProjectInput = z.infer<typeof CreateProjectInput>
export type UpdateProjectInput = z.infer<typeof UpdateProjectInput>
export type CreateJobInput = z.infer<typeof CreateJobInput>
export type UpdateJobInput = z.infer<typeof UpdateJobInput>
export type ArchiveInput = z.infer<typeof ArchiveInput>
export type ListStructureInput = z.infer<typeof ListStructureInput>
