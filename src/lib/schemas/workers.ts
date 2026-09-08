import { z } from 'zod'

export const RoleEnum = z.enum(['operator', 'billing', 'admin'])
const roles = z
  .array(RoleEnum)
  .min(1)
  .refine((r) => r.includes('operator'), { message: 'ROLES_MUST_INCLUDE_OPERATOR' })

export const InviteInput = z.object({
  email: z.email(),
  name: z.string().min(1).max(100),
  roles,
  supervisorId: z.string().min(1).nullable().optional(),
})
export const ResendInviteInput = z.object({ workerId: z.string().min(1) })
export const AgentWorkerInput = z.object({
  name: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  framework: z.string().min(1).max(100),
  status: z.enum(['active', 'inactive']).default('active'),
  supervisorId: z.string().min(1),
})
export const UpdateAgentWorkerInput = AgentWorkerInput.partial().extend({ workerId: z.string().min(1) })
export const SetRolesInput = z.object({ workerId: z.string().min(1), roles })
export const SetSupervisorInput = z.object({ workerId: z.string().min(1), supervisorId: z.string().min(1).nullable() })
export const ArchiveWorkerInput = z.object({ workerId: z.string().min(1) })

export type Role = z.infer<typeof RoleEnum>
export type InviteInput = z.infer<typeof InviteInput>
export type ResendInviteInput = z.infer<typeof ResendInviteInput>
export type AgentWorkerInput = z.infer<typeof AgentWorkerInput>
export type UpdateAgentWorkerInput = z.infer<typeof UpdateAgentWorkerInput>
export type SetRolesInput = z.infer<typeof SetRolesInput>
export type SetSupervisorInput = z.infer<typeof SetSupervisorInput>
export type ArchiveWorkerInput = z.infer<typeof ArchiveWorkerInput>
