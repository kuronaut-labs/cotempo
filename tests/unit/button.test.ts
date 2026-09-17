import { describe, expect, it } from 'vitest'
import { buttonClass } from '~/components/ui/button'

describe('buttonClass', () => {
  it('maps variant and size', () => {
    expect(buttonClass('primary', 'lg')).toBe('btn btn--primary btn--lg')
  })

  it('defaults to secondary md with no extra', () => {
    expect(buttonClass()).toBe('btn btn--secondary btn--md')
  })

  it('appends extra classes last', () => {
    expect(buttonClass('ghost', 'sm', 'nav-extra')).toBe(
      'btn btn--ghost btn--sm nav-extra',
    )
  })

  it('falls back on unknown variant or size', () => {
    expect(buttonClass('sparkly' as never, 'xl' as never)).toBe(
      'btn btn--secondary btn--md',
    )
  })
})
