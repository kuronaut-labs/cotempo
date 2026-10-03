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

const nullishText = (max: number) => z.string().max(max).nullish()
const contactFields = {
  name: z.string().min(1).max(120),
  role: nullishText(120),
  email: z.email().nullish(),
  phone: nullishText(40),
  notes: nullishText(2000),
}

export const UpdateClientDetailsInput = z.object({
  id: z.string().min(1),
  email: z.email().nullish(),
  phone: nullishText(40),
  website: z.url().nullish(),
  addressLine1: nullishText(200),
  addressLine2: nullishText(200),
  city: nullishText(80),
  region: nullishText(80),
  postcode: nullishText(20),
  country: nullishText(80),
  notes: nullishText(2000),
})

export type UpdateClientDetailsInput = z.infer<typeof UpdateClientDetailsInput>

export const CreateContactInput = z.object({ clientId: z.string().min(1), ...contactFields })
export type CreateContactInput = z.infer<typeof CreateContactInput>

export const UpdateContactInput = z.object({ id: z.string().min(1), ...contactFields })
export type UpdateContactInput = z.infer<typeof UpdateContactInput>

export const ArchiveContactInput = z.object({ id: z.string().min(1) })
export type ArchiveContactInput = z.infer<typeof ArchiveContactInput>

export const SetPrimaryContactInput = z.object({ id: z.string().min(1), clientId: z.string().min(1) })
export type SetPrimaryContactInput = z.infer<typeof SetPrimaryContactInput>
