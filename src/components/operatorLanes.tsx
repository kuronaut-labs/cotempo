import { DayMathChip } from '~/components/dayMathChip'
import { localDayBoundariesUtcMs, type Range, type Trio } from '~/lib/dayMath'
import { MiniStrip, type StripInterval } from '~/components/miniStrip'
import type { OperatorLane as OperatorLaneData, TimeRecon } from '~/server/services/reports'

/* Convert a TimeRecon (which has billableMin) to the Trio shape the existing chip expects. */
function asTrio(r: TimeRecon): Trio {
  return { wallClockMin: r.wallClockMin, effortMin: r.effortMin, premiumMin: r.premiumMin }
}

/* Build a 1..5 job-color mapping for one lane: jobs are numbered in the order their
   pieces first appear, wrapping with `% 5 + 1` so two jobs with similar usage don't
   always land on the same colour. */
function jobColorMap(lane: OperatorLaneData): Record<string, number> {
  const idx: Record<string, number> = {}
  let n = 0
  for (const d of lane.days) {
    for (const p of d.pieces) {
      if (!(p.jobId in idx)) {
        n += 1
        idx[p.jobId] = ((n - 1) % 5) + 1
      }
    }
  }
  return idx
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
export function OperatorLanes({ lanes, tz }: { lanes: OperatorLaneData[]; tz: string }) {
  if (lanes.length === 0) {
    return <div className="lanebody-empty">No time logged in this period.</div>
  }
  return (
    <div className="operatorlanes">
      {lanes.map((lane) => {
        const colors = jobColorMap(lane)
        return (
          <div className="lane" key={lane.workerId}>
            <div className="lanehead">
              <div className="nm">
                {lane.name}
                <span className={`wtag ${lane.kind}`}>{lane.kind}</span>
              </div>
              <DayMathChip trio={asTrio(lane.total)} />
            </div>
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
                        <MiniStrip day={day} tz={tz} intervals={toStripIntervals(d.pieces)} jobColorIndex={colors} />
                      </div>
                      <DayMathChip trio={asTrio(d.trio)} />
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
