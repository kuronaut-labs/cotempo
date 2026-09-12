import { formatDecimalHours } from '~/lib/money'
import type { Flag } from '~/lib/redFlags'

/* Plain-language per-kind label; hover (when wired) calls onHover(intervalId). */
const LABELS: Record<Flag['kind'], (f: Flag) => string> = {
  gap: (f) => (f.day ? `Gap on ${f.day}` : 'Gap'),
  late_entry: () => 'Entered after the late-entry window',
  multi_edit: (f) => `Edited ${(f.detail.match(/\d+/) ?? ['?'])[0]} times`,
  retroactive: () => 'Entered on a later day than it started',
  non_supervisor: () => 'Entered by someone other than the worker or their supervisor',
}

const KIND_ORDER: Flag['kind'][] = ['gap', 'late_entry', 'multi_edit', 'retroactive', 'non_supervisor']

export function RedFlagList({ flags, onHover }: { flags: Flag[]; onHover: (intervalId?: string) => void }) {
  if (flags.length === 0) return <div className="flaglist-empty">No flags.</div>
  const byKind = new Map<Flag['kind'], Flag[]>()
  for (const f of flags) {
    const list = byKind.get(f.kind) ?? []
    list.push(f)
    byKind.set(f.kind, list)
  }
  return (
    <ul className="flaglist">
      {KIND_ORDER.filter((k) => byKind.has(k)).map((kind) => (
        <li className="flaglist-kind" key={kind}>
          <div className="flaglist-kind-h">{kind.replace('_', ' ')}</div>
          <ul>
            {byKind.get(kind)!.map((f, i) => (
              <li
                key={i}
                className="flaglist-row"
                onMouseEnter={() => onHover(f.intervalId)}
                onMouseLeave={() => onHover(undefined)}
              >
                {LABELS[kind](f)}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

void formatDecimalHours
