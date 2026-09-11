import { describe, expect, it } from 'vitest'
import { centsToDollarsInput, parseDollars, rateLabel } from '~/components/structureTree'

describe('parseDollars (#18: blank = non-billable null; 0 = $0 billable)', () => {
  it('blank → null (non-billable)', () => {
    expect(parseDollars('')).toEqual({ ok: true, cents: null })
  })

  it('whitespace-only → null', () => {
    expect(parseDollars('   ')).toEqual({ ok: true, cents: null })
  })

  it("'0' → 0 (billable at $0)", () => {
    expect(parseDollars('0')).toEqual({ ok: true, cents: 0 })
  })

  it("'90.5' → 9050", () => {
    expect(parseDollars('90.5')).toEqual({ ok: true, cents: 9050 })
  })

  it("'90.55' → 9055", () => {
    expect(parseDollars('90.55')).toEqual({ ok: true, cents: 9055 })
  })

  it('trims surrounding spaces', () => {
    expect(parseDollars(' 90.50 ')).toEqual({ ok: true, cents: 9050 })
  })

  it.each(['90.555', '-1', 'abc', '1e3', '90.', '.5', '$90'])('rejects %s', (raw) => {
    expect(parseDollars(raw).ok).toBe(false)
  })
})

describe('centsToDollarsInput', () => {
  it('null/undefined → blank input', () => {
    expect(centsToDollarsInput(null)).toBe('')
    expect(centsToDollarsInput(undefined)).toBe('')
  })

  it('0 → "0"', () => {
    expect(centsToDollarsInput(0)).toBe('0')
  })

  it('9050 → "90.5" (parses back to the same cents)', () => {
    expect(centsToDollarsInput(9050)).toBe('90.5')
  })

  it('9055 → "90.55"', () => {
    expect(centsToDollarsInput(9055)).toBe('90.55')
  })
})

describe('rateLabel', () => {
  it('null → non-billable', () => {
    expect(rateLabel(null)).toBe('non-billable')
  })

  it('0 → $0.00/hr', () => {
    expect(rateLabel(0)).toBe('$0.00/hr')
  })

  it('9050 → $90.50/hr', () => {
    expect(rateLabel(9050)).toBe('$90.50/hr')
  })
})
