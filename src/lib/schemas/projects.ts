import { z } from 'zod'
import { ListClientsInput } from './clients'

export const ListProjectsInput = ListClientsInput.extend({
  clientId: z.string().min(1).optional(),
  // Only meaningful once the assignments plan landed; otherwise 'any'.
  due: z.enum(['overdue', 'soon', 'none', 'any']).default('any'),
})

export type ListProjectsInput = z.infer<typeof ListProjectsInput>
