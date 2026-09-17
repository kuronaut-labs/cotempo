import { z } from 'zod'

// absent = keep current, null = clear (rate, weekly target). dayMinutes is
// notNull in storage so it is optional-only here.
export const OrgSettingsInput = z.object({
  defaultBillableRateCents: z.number().int().min(0).max(10_000_000).nullish(),
  defaultDayMinutes: z.number().int().min(15).max(720).optional(),
  defaultWeeklyTargetHours: z.number().int().min(0).max(80).nullish(),
})
export type OrgSettingsInput = z.infer<typeof OrgSettingsInput>

export type OrgSettingsView = {
  defaultDayMinutes: number
  defaultWeeklyTargetHours: number | null
  defaultBillableRateCents?: number | null
}
