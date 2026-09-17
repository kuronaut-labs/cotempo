import type { ComponentProps } from 'react'

/* solid = DESIGN "Published", outline = "Draft", inverse = "Featured",
   muted = "Archived". error/success are app extensions (rejected weeks,
   billable tag) — same construction, status colors. */
export type ChipKind = 'solid' | 'outline' | 'inverse' | 'muted' | 'error' | 'success'

const KINDS: ChipKind[] = ['solid', 'outline', 'inverse', 'muted', 'error', 'success']

export function statusChipClass(kind: ChipKind = 'outline', extra = '') {
  const k = KINDS.includes(kind) ? kind : 'outline'
  return ['chip', `chip--${k}`, extra].filter(Boolean).join(' ')
}

export function filterChipClass(selected = false, extra = '') {
  return ['chip', 'chip--filter', selected ? 'chip--selected' : '', extra]
    .filter(Boolean)
    .join(' ')
}

export function StatusChip({
  kind = 'outline',
  className,
  ...rest
}: ComponentProps<'span'> & { kind?: ChipKind }) {
  return <span className={statusChipClass(kind, className)} {...rest} />
}

export function FilterChip({
  selected = false,
  className,
  type = 'button',
  ...rest
}: ComponentProps<'button'> & { selected?: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={filterChipClass(selected, className)}
      {...rest}
    />
  )
}
