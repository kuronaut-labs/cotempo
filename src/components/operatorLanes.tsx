import { DayMathChip } from '~/components/dayMathChip'
import { localDayBoundariesUtcMs, type Range, type Trio } from '~/lib/dayMath'
import { MiniStrip, type StripInterval } from '~/components/miniStrip'
import type { OperatorLane as OperatorLaneData, TimeRecon } from '~/server/services/reports'

/* Convert a TimeRecon (which has billableMin) to the Trio shape the existing chip expects. */
function asTrio(r: TimeRecon): Trio {
  return { wallClockMin: r.wallClockMin, effortMin: r.effortMin, premiumMin: r.premiumMin }
}

function toStripIntervals(pieces: OperatorLaneData['days'][number]['pieces']): StripInterval[] {
  return pieces.map((p, i) => ({
    id: `${i}-${p.startMs}-${p.endMs}-${p.jobId}`,
    jobId: p.jobId,
    startMs: p.startMs,
    endMs: p.endMs,
  }))
}

/* Per-worker, per-day view: read-only mini-timeline (from 4.4b's stripBlocks) plus a
   trio chip. Operators see time only; the service never sends `cents` for this shape
   so the trio's `$` segment never appears. */
export function OperatorLanes({ lanes, tz, jobColorIndex, selfWorkerId }: {
  lanes: OperatorLaneData[]
  tz: string
  jobColorIndex: Record<string, number>
  selfWorkerId?: string
}) {
  if (lanes.length === 0) {
    return <div className="lanebody-empty">No time logged in this period.</div>
  }
  return (
    <div className="operatorlanes">
      {lanes.map((lane) => {
        // open prop re-applies only for the self lane; supervisee toggles persist across period re-renders.
        return (
          <details className="lane" key={lane.workerId} open={lane.workerId === selfWorkerId || undefined}>
            <summary className="lanehead">
              <div className="nm">
                {lane.name}
                <span className={`wtag ${lane.kind}`}>{lane.kind}</span>
              </div>
              <DayMathChip trio={asTrio(lane.total)} />
            </summary>
            <div className="lanebody">
              {lane.days.length === 0 ? (
                <div className="lanebody-empty">No time logged.</div>
              ) : (
                lane.days.map((d) => {
                  const day: Range = localDayBoundariesUtcMs(d.day, tz)
                  return (
                    <div className="row" key={d.day}>
                      <div className="daylabel">{d.day}</div>
                      <div className="strip">
                        <MiniStrip day={day} tz={tz} intervals={toStripIntervals(d.pieces)} jobColorIndex={jobColorIndex} />
                      </div>
                      <DayMathChip trio={asTrio(d.trio)} />
                    </div>
                  )
                })
              )}
            </div>
          </details>
        )
      })}
    </div>
  )
}
