import { createServerFn } from '@tanstack/react-start'
import { ExportCsvInput, InvoiceInput } from '~/lib/schemas/reports'
import { authMw, ctxOf } from '~/server/middleware/authMw'
import { requireRole } from '~/server/middleware/roleGuard'
import { runtimeDeps } from '~/server/runtimeDeps'
import * as svc from '~/server/services/exports'

/* Returns the CSV body as a Response with the right content headers. */
export const exportCsvFn = createServerFn({ method: 'GET' })
  .middleware([authMw, requireRole('billing', 'admin')])
  .validator(ExportCsvInput)
  .handler(async ({ data, context }) => {
    const { filename, body } = await svc.exportCsv(runtimeDeps(), ctxOf(context), data)
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    })
  })

export const invoiceDataFn = createServerFn({ method: 'GET' })
  .middleware([authMw, requireRole('billing', 'admin')])
  .validator(InvoiceInput)
  .handler(({ data, context }) => svc.invoiceData(runtimeDeps(), ctxOf(context), data))

export type { Invoice, InvoiceLine } from '~/server/services/exports'
