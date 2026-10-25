import { useEffect, useId, useRef, useState } from 'react'
import type { ClientNode } from '~/server/services/structure'

type RecentJob = {
  jobId: string
  jobName: string
  projectName: string
  clientName: string
}

/**
 * One searchable job picker for every entry surface (LD6): text input +
 * listbox; Assigned/Recent groups above the client hierarchy; matches job,
 * project and client names; replaces the client-then-job double select.
 */
export function JobPicker({
  structure,
  recentJobs,
  assigned,
  value,
  onChange,
  autoFocus = false,
}: {
  structure: ClientNode[]
  recentJobs?: RecentJob[]
  /** Assigned job ids, first group; computed upstream from assignments + structure. */
  assigned?: Set<string>
  value: string
  onChange: (jobId: string) => void
  autoFocus?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  // aria ids: pickers mount per worker lane, so option ids can't collide (#P2-1).
  const uid = useId()

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const groups = buildGroups(structure, recentJobs, assigned ?? new Set())
  const q = draft.trim().toLowerCase()
  const filtered = groups
    .map((g) => ({ ...g, jobs: g.jobs.filter((j) => !q || j.keywords.includes(q)) }))
    .filter((g) => g.jobs.length > 0)
  const jobs = filtered.flatMap((g) => g.jobs)
  // Rendering clamps instead of an effect: the filter can drop the previously
  // highlighted option, leaving `active` past the end of `jobs`.
  const activeIdx = jobs.length > 0 ? Math.min(active, jobs.length - 1) : 0

  const jobOptions = new Map(
    [...groups.flatMap((g) => g.jobs)].map((j) => [j.jobId, j.label]),
  )
  const selectedLabel = jobOptions.get(value) ?? ''

  const commit = (j: (typeof jobs)[number]) => {
    onChange(j.jobId)
    setOpen(false)
    setDraft('')
  }

  return (
    <div className="jobpicker">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? `${uid}-list` : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && jobs[activeIdx] ? `${uid}-opt-${activeIdx}` : undefined}
        placeholder="Search jobs…"
        value={open ? draft : selectedLabel}
        onChange={(e) => {
          setDraft(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => {
          setOpen(true)
          setDraft('')
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActive((a) => Math.min(a + 1, Math.max(0, jobs.length - 1)))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter' && open && jobs[activeIdx]) {
            e.preventDefault()
            commit(jobs[activeIdx]!)
          } else if (e.key === 'Escape') {
            setOpen(false)
            setDraft('')
          }
        }}
        onBlur={() => {
          // Delay so the option's onMouseDown still lands before blur closes.
          setTimeout(() => setOpen(false), 120)
        }}
      />
      {open && (
        <ul id={`${uid}-list`} role="listbox" className="jobpicker-list" aria-label="Jobs">
          {filtered.length === 0 ? (
            <li className="jobpicker-group">No jobs match</li>
          ) : (
            filtered.map((g) => (
              <li key={g.key} className="jobpicker-group">
                {g.key !== 'Assigned' && g.key !== 'Recent' ? <span>{g.kind === 'named' ? g.label : ''}</span> : <span>{g.label}</span>}
                <ul>
                  {g.jobs.map((j) => {
                    const idx = jobs.indexOf(j)
                    return (
                      <li
                        key={j.key}
                        id={`${uid}-opt-${idx}`}
                        role="option"
                        aria-selected={j.jobId === value}
                        className={idx === activeIdx ? 'is-active' : ''}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          commit(j)
                        }}
                      >
                        {j.label}
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

type Group = {
  key: string
  label: string
  kind: 'named' | 'tag'
  jobs: { key: string; jobId: string; label: string; keywords: string }[]
}

function buildGroups(
  structure: ClientNode[],
  recentJobs: RecentJob[] | undefined,
  assigned: Set<string>,
): Group[] {
  const seen = new Set<string>()
  const groups: Group[] = []

  const take = (jobId: string): boolean => {
    if (seen.has(jobId)) return false
    seen.add(jobId)
    return true
  }

  if (assigned.size > 0) {
    const jobs: Group['jobs'] = []
    for (const c of structure)
      for (const p of c.projects)
        for (const j of p.jobs) {
          if (j.archivedAt || !assigned.has(j.id) || !take(j.id)) continue
          jobs.push({
            key: j.id,
            jobId: j.id,
            label: `${j.name} · ${p.name}${j.dueOn ?? p.dueOn ? ` · due ${j.dueOn ?? p.dueOn}` : ''}`,
            keywords: `${j.name} ${p.name} ${c.name}`.toLowerCase(),
          })
        }
    if (jobs.length) groups.push({ key: 'Assigned', label: 'Assigned', kind: 'tag', jobs })
  }

  if (recentJobs?.length) {
    const jobs: Group['jobs'] = []
    for (const r of recentJobs) {
      if (!take(r.jobId)) continue
      jobs.push({
        key: r.jobId,
        jobId: r.jobId,
        label: `${r.clientName} / ${r.projectName} / ${r.jobName}`,
        keywords: `${r.jobName} ${r.projectName} ${r.clientName}`.toLowerCase(),
      })
    }
    if (jobs.length) groups.push({ key: 'Recent', label: 'Recent', kind: 'tag', jobs })
  }

  for (const c of structure) {
    if (c.archivedAt) continue
    for (const p of c.projects) {
      if (p.archivedAt) continue
      const jobs: Group['jobs'] = []
      for (const j of p.jobs) {
        if (j.archivedAt || !take(j.id)) continue
        jobs.push({
          key: j.id,
          jobId: j.id,
          label: j.name,
          keywords: `${j.name} ${p.name} ${c.name}`.toLowerCase(),
        })
      }
      if (jobs.length) groups.push({ key: `${c.name} › ${p.name}`, label: `${c.name} › ${p.name}`, kind: 'named', jobs })
    }
  }
  return groups
}
