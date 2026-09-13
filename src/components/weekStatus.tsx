import type { MyWeek } from '~/server/services/approvals'
import { formatWeekLabel } from '~/lib/dayMath'

export const STATUS_LABEL: Record<MyWeek['status'], string> = {
  none: 'Not started',
  draft: 'Not started',
  submitted: 'Waiting for approval',
  approved: 'Approved',
  rejected: 'Sent back',
}

/* Status badge + submit affordance. Disabled when no entries or not submit-eligible
   (already submitted/approved). A rejected week shows the reason as a visible
   line under the badge — never in a tooltip, which is hover-only and unreachable
   on touch / keyboard / no-mouse devices. (#P0.2, #P0.4) */
export function WeekStatus({
  week,
  canSubmit,
  hasIntervals,
  onSubmit,
}: {
  week: MyWeek
  canSubmit: boolean
  hasIntervals: boolean
  onSubmit: () => void
}) {
  const status = week.status
  const label = STATUS_LABEL[status]
  const badge = <span className={`weekstatus-badge ${status}`}>{label}</span>
  const reason = status === 'rejected' && week.rejectedReason ? week.rejectedReason : null

  const eligible = canSubmit && hasIntervals && (status === 'draft' || status === 'rejected' || status === 'none')
  const disabledReason = !hasIntervals
    ? 'No entries logged this week'
    : !canSubmit
      ? 'You do not have submit rights for this worker'
      : status === 'submitted' || status === 'approved'
        ? `Week is ${label.toLowerCase()}`
        : undefined

  return (
    <div className="weekstatus">
      <div className="weekstatus-row">
        <span className="weekstatus-week">{formatWeekLabel(week.weekStart)}</span>
        {badge}
      </div>
      {reason ? (
        <p className="weekstatus-rejected" role="status">
          Sent back: {reason}
        </p>
      ) : null}
      {eligible ? (
        <button type="button" className="weekstatus-submit" onClick={onSubmit}>
          Submit week
        </button>
      ) : (
        <button type="button" className="weekstatus-submit" disabled title={disabledReason}>
          Submit week
        </button>
      )}
    </div>
  )
}
