import { describe, expect, it } from 'vitest'
import { filterChipClass, statusChipClass } from '~/components/ui/chip'

describe('statusChipClass', () => {
  it('maps kind', () => {
    expect(statusChipClass('solid')).toBe('chip chip--solid')
  })

  it('defaults to outline and appends extra', () => {
    expect(statusChipClass(undefined, 'extra-x')).toBe('chip chip--outline extra-x')
  })

  it('falls back on unknown kind', () => {
    expect(statusChipClass('glowy' as never)).toBe('chip chip--outline')
  })
})

describe('filterChipClass', () => {
  it('is unselected by default', () => {
    expect(filterChipClass()).toBe('chip chip--filter')
  })

  it('adds selected and extra', () => {
    expect(filterChipClass(true, 'tab-x')).toBe('chip chip--filter chip--selected tab-x')
  })
})
