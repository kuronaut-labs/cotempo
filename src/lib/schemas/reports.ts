import { z } from 'zod'

export const PeriodInput = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine((v) => v.to >= v.from, { message: 'TO_BEFORE_FROM', path: ['to'] })
export const DailyReportInput = PeriodInput
export const KpiInput = z.object({ date: z.iso.date() })
export const ExportCsvInput = z
  .object({ from: z.iso.date(), to: z.iso.date(), view: z.enum(['intervals', 'daily', 'leave', 'events', 'allocations']), clientId: z.string().min(1).nullish(), projectId: z.string().min(1).nullish() })
  .refine((v) => v.to >= v.from, { message: 'TO_BEFORE_FROM', path: ['to'] })
export const InvoiceInput = z.object({ clientId: z.string().min(1), from: z.iso.date(), to: z.iso.date() }).refine((v) => v.to >= v.from, { message: 'TO_BEFORE_FROM', path: ['to'] })

export type PeriodInput = z.infer<typeof PeriodInput>
export type KpiInput = z.infer<typeof KpiInput>
export type ExportCsvInput = z.infer<typeof ExportCsvInput>

export const WeeksInput = z.object({ weeks: z.number().int().min(1).max(26).default(8) })
export type WeeksInput = z.infer<typeof WeeksInput>
export type InvoiceInput = z.infer<typeof InvoiceInput>
