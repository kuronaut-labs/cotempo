import { z } from 'zod'

export const ListClientsInput = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(['active', 'archived', 'all']).default('active'),
  activeSince: z.iso.date().optional(), // has an interval starting on/after this day
  sort: z.enum(['name', 'lastActivity', 'effort']).default('name'),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
})

export type ListClientsInput = z.infer<typeof ListClientsInput>
