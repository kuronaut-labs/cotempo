import { useEffect, useState } from 'react'
import { StatusChip, FilterChip } from '~/components/ui/chip'
import { localDateTimeOf } from '~/lib/dayMath'
import { formatCents, formatHmm } from '~/lib/money'

export type EntityListRow = {
  id: string
  name: string
  /** False for live entities, true once archivedAt is set. */
  archived: boolean
  /** Projects (clients page) or jobs (projects page). */
  count: number
  countLabel: string
  href: string
  effortMin: number
  lastActivityMs: number | null
  billableCents?: number
}

export type EntityFilter = { key: string; label: string; active: boolean; onSelect: () => void }

export function EntityList({
  rows,
  nextCursor,
  loadMore,
  q,
  onQuery,
  status,
  onStatus,
  filters = [],
  sort,
  onSort,
  tz,
  placeholder,
  emptyText,
}: {
  rows: EntityListRow[]
  /** Cursor for the next page; null when exhausted. */
  nextCursor: string | null
  loadMore: (cursor: string) => Promise<{ rows: EntityListRow[]; nextCursor: string | null }>
  q: string
  onQuery: (q: string) => void
  status: 'active' | 'archived' | 'all'
  onStatus: (s: 'active' | 'archived' | 'all') => void
  filters?: EntityFilter[]
  sort: string
  onSort: (s: string) => void
  tz: string
  placeholder: string
  emptyText: string
}) {
  const [draft, setDraft] = useState(q)
  const [extra, setExtra] = useState<EntityListRow[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => setDraft(q), [q])
  useEffect(() => {
    const t = setTimeout(() => {
      if (draft !== q) onQuery(draft)
    }, 250)
    return () => clearTimeout(t)
  }, [draft])

  const showMoney = rows.some((r) => 'billableCents' in r)
  const all = [...rows, ...extra]

  return (
    <div className="entitylist">
      <div className="entitylist-head">
        <input
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        <span className="spacer" />
        {(['active', 'archived', 'all'] as const).map((s) => (
          <FilterChip key={s} selected={status === s} onClick={() => onStatus(s)}>
            {s === 'active' ? 'Active' : s === 'archived' ? 'Archived' : 'All'}
          </FilterChip>
        ))}
        {filters.map((f) => (
          <FilterChip key={f.key} selected={f.active} onClick={f.onSelect}>
            {f.label}
          </FilterChip>
        ))}
        <label className="field">
          <span>Sort</span>
          <select value={sort} onChange={(e) => onSort(e.target.value)}>
            <option value="name">Name</option>
            <option value="lastActivity">Last activity</option>
            <option value="effort">Effort</option>
          </select>
        </label>
      </div>
      {all.length === 0 ? (
        <p className="intervallist-empty">{emptyText}</p>
      ) : (
        <table className="recontable">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th aria-label="count" />
              <th>Effort</th>
              <th>Last activity</th>
              {showMoney ? <th>Billable</th> : null}
            </tr>
          </thead>
          <tbody>
            {all.map((r) => (
              <tr key={r.id}>
                <td>
                  <a href={r.href}>{r.name}</a>
                </td>
                <td>{r.archived ? <StatusChip kind="muted">Archived</StatusChip> : <StatusChip kind="success">Active</StatusChip>}</td>
                <td>
                  {r.count} {r.countLabel}
                </td>
                <td className="mono">{formatHmm(r.effortMin)}</td>
                <td className="mono">{r.lastActivityMs == null ? '—' : localDateTimeOf(r.lastActivityMs, tz)}</td>
                {showMoney ? <td className="mono">{r.billableCents == null ? '—' : formatCents(r.billableCents)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {nextCursor ? (
        <button
          type="button"
          className="loadmore"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              const next = await loadMore(nextCursor)
              setExtra((prev) => [...prev, ...next.rows])
            } finally {
              setBusy(false)
            }
          }}
        >
          Load more
        </button>
      ) : null}
    </div>
  )
}

