import type { MyWeek } from '~/server/services/approvals'

/* Status badge + submit affordance. Disabled when no intervals or not submit-eligible
   (already submitted/approved). Tooltip on the badge shows the rejection reason. */
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
  const badge = (
    <span className={`weekstatus-badge ${status}`} title={status === 'rejected' ? week.rejectedReason ?? undefined : undefined}>
      {status}
    </span>
  )

  const eligible = canSubmit && hasIntervals && (status === 'draft' || status === 'rejected' || status === 'none')
  const disabledReason = !hasIntervals
    ? 'No intervals logged this week'
    : !canSubmit
      ? 'You do not have submit rights for this worker'
      : status === 'submitted' || status === 'approved'
        ? `Week is ${status}`
        : undefined

  return (
    <div className="weekstatus">
      {badge}
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
