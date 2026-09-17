import { z } from 'zod'

export const PeriodInput = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine((v) => v.to >= v.from, { message: 'TO_BEFORE_FROM', path: ['to'] })
export const DailyReportInput = PeriodInput
export const KpiInput = z.object({ date: z.iso.date() })
export const ExportCsvInput = z.object({ from: z.iso.date(), to: z.iso.date(), view: z.enum(['intervals', 'daily', 'leave']) })
export const InvoiceInput = z.object({ clientId: z.string().min(1), from: z.iso.date(), to: z.iso.date() })

export type PeriodInput = z.infer<typeof PeriodInput>
export type KpiInput = z.infer<typeof KpiInput>
export type ExportCsvInput = z.infer<typeof ExportCsvInput>
export type InvoiceInput = z.infer<typeof InvoiceInput>
