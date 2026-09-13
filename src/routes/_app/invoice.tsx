import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { formatCents, formatHmm } from '~/lib/money'
import { localHHMM } from '~/lib/dayMath'
import { getSessionCtxFn } from '~/server/fns/auth'
import { getTodayFn } from '~/server/fns/intervals'
import { invoiceDataFn } from '~/server/fns/exports'
import { listStructureFn } from '~/server/fns/structure'
import { thisWeek } from '~/components/periodSelector'
import type { ClientNode } from '~/server/services/structure'
import type { Invoice } from '~/server/services/exports'

const searchSchema = z.object({
  clientId: z.string().min(1).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional(),
})

export const Route = createFileRoute('/_app/invoice')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ clientId: search.clientId, from: search.from, to: search.to }),
  loader: async ({ deps }) => {
    const ctx = await getSessionCtxFn()
    if (!ctx) return { ctx: null, today: null, tz: null as string | null, period: null as { from: string; to: string } | null, invoice: null as Invoice | null, tree: null as ClientNode[] | null }
    const todayP = getTodayFn()
    const today = await todayP
    const tz = today.tz
    const week = thisWeek(today.date, tz)
    const from = deps.from ?? week.from
    const to = deps.to ?? week.to
    if (!deps.clientId) {
      const tree = await listStructureFn({ data: { includeArchived: false } })
      return { ctx, today: today.date, tz, period: { from, to }, invoice: null, tree }
    }
    const invoice = await invoiceDataFn({ data: { clientId: deps.clientId, from, to } })
    return { ctx, today: today.date, tz, period: { from, to }, invoice, tree: null as ClientNode[] | null }
  },
  component: InvoiceView,
})

function InvoiceView() {
  const data = Route.useLoaderData() as {
    ctx: { name: string } | null
    today: string | null
    tz: string | null
    period: { from: string; to: string } | null
    invoice: Invoice | null
    tree: ClientNode[] | null
  }

  if (!data.ctx || !data.period) {
    return <main className="invoice">Sign in to view invoices.</main>
  }

  return (
    <main className="invoice">
      <header className="invoice-actions no-print">
        <Link to="/reports">← Back to reports</Link>
        <button type="button" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </header>

      {!data.invoice ? (
        <ClientPicker tree={data.tree ?? []} period={data.period} />
      ) : (
        <InvoicePage invoice={data.invoice} />
      )}
    </main>
  )
}

function ClientPicker({ tree, period }: { tree: ClientNode[]; period: { from: string; to: string } }) {
  const live = tree.filter((c) => !c.archivedAt)
  return (
    <section className="invoice-picker">
      <h1>Invoices</h1>
      <p className="invoice-period">
        Period: {period.from} – {period.to}
      </p>
      <ul className="invoice-picker-list">
        {live.map((c) => (
          <li key={c.id}>
            <Link
              to="/invoice"
              search={{ clientId: c.id, from: period.from, to: period.to }}
            >
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function InvoicePage({ invoice }: { invoice: Invoice }) {
  return (
    <article className="invoice-page">
      <header className="invoice-head">
        <div>
          <h1>Invoice</h1>
          <div className="invoice-client">{invoice.client.name}</div>
        </div>
        <div className="invoice-meta">
          <div>
            <span className="invoice-k">Period</span>
            <span className="invoice-v">
              {invoice.period.from} – {invoice.period.to}
            </span>
          </div>
          <div>
            <span className="invoice-k">Generated</span>
            <span className="invoice-v">{invoice.generatedAt.toISOString().slice(0, 16).replace('T', ' ')}</span>
          </div>
          <div>
            <span className="invoice-k">Timezone</span>
            <span className="invoice-v">{invoice.orgTimezone}</span>
          </div>
        </div>
      </header>

      <table className="invoice-lines">
        <thead>
          <tr>
            <th>Job</th>
            <th>Project</th>
            <th className="num">Billable hrs</th>
            <th className="num">Rate</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((l) => (
            <tr key={l.jobId}>
              <td>{l.job}</td>
              <td>{l.project}</td>
              <td className="num">{formatHmm(l.billableMin)}</td>
              <td className="num">{l.rateCents !== null ? `$${(l.rateCents / 100).toFixed(2)}/h` : '—'}</td>
              <td className="num">{formatCents(l.cents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="num invoice-subtotal-label">
              Subtotal
            </td>
            <td className="num invoice-subtotal">{formatCents(invoice.subtotalCents)}</td>
          </tr>
        </tfoot>
      </table>

      <section className="invoice-trio">
        <div className="trio">
          <div className="seg b">
            <span className="k">Billable</span>
            <span className="v">{formatHmm(invoice.recon.billableMin)}</span>
          </div>
          <div className="seg h">
            <span className="k">On the clock</span>
            <span className="v">{formatHmm(invoice.recon.wallClockMin)}</span>
          </div>
          <div className="seg p">
            <span className="k">Overlap</span>
            <span className="v">+{formatHmm(invoice.recon.premiumMin)}</span>
          </div>
          <div className="seg dollar">
            <span className="k">Subtotal</span>
            <span className="v">{formatCents(invoice.subtotalCents)}</span>
          </div>
        </div>
        <p className="invoice-disclosure">
          <strong>How overlap time is calculated:</strong> when work on two jobs happens at the same time, each job is billed for its own minutes. &ldquo;On the clock&rdquo; counts that shared time once. The overlap above is the difference &mdash; the extra minutes that come from working on two jobs at once. We show it so you can see exactly what you&rsquo;re being billed for and why.
        </p>
      </section>

      <span style={{ display: 'none' }} aria-hidden>
        {localHHMM.name}
      </span>
    </article>
  )
}
