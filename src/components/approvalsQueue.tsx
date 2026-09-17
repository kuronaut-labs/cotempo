import { TrioChip } from '~/components/trioChip'
import { formatCents, formatHmm } from '~/lib/money'
import { formatWeekLabel } from '~/lib/dayMath'
import type { PendingWeek } from '~/server/services/approvals'

/* Queue of submitted weeks awaiting approval. Clicking a row calls onSelect. */
export function ApprovalsQueue({
  weeks,
  selected,
  onSelect,
}: {
  weeks: PendingWeek[]
  selected?: { workerId: string; weekStart: string }
  onSelect: (w: { workerId: string; weekStart: string }) => void
}) {
  if (weeks.length === 0) {
    return <div className="approvalsqueue-empty">No submitted weeks.</div>
  }
  return (
    <ul className="approvalsqueue">
      {weeks.map((w) => {
        const isSel = selected && selected.workerId === w.workerId && selected.weekStart === w.weekStart
        const cents = 'cents' in w.recon ? w.recon.cents : undefined
        return (
          <li key={`${w.workerId}-${w.weekStart}`} className={isSel ? 'selected' : undefined}>
            <button type="button" onClick={() => onSelect({ workerId: w.workerId, weekStart: w.weekStart })}>
              <div className="nm">{w.workerName}</div>
              <div className="wk">{formatWeekLabel(w.weekStart)}</div>
              <TrioChip recon={w.recon} />
              {cents !== undefined ? <div className="cents">${formatCents(cents)}</div> : null}
              <div className="flagcount" title={`${w.flagCount} red flag${w.flagCount === 1 ? '' : 's'}`}>
                {w.flagCount > 0 ? `⚑ ${w.flagCount}` : 'no flags'}
              </div>
              <div className="effort">{formatHmm(w.recon.effortMin)}</div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
