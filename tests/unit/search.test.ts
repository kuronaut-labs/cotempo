import { describe, expect, it } from 'vitest'
import { likePattern, makeCursor, parseCursor } from '~/lib/search'
import { HttpError } from '~/lib/errors'

describe('likePattern', () => {
  it('wraps the query in % wildcards', () => {
    expect(likePattern('acme')).toBe('%acme%')
  })

  it('escapes %, _ and backslash with backslash', () => {
    expect(likePattern('a%b_c\\d')).toBe('%a\\%b\\_c\\\\d%')
  })
})

describe('cursor round-trip', () => {
  it('makes and parses a cursor', () => {
    const c = makeCursor('Acme Aerospace', 'c1')
    expect(parseCursor(c)).toEqual({ sortValue: 'Acme Aerospace', id: 'c1' })
  })

  it('round-trips numbers and null sort values', () => {
    expect(parseCursor(makeCursor(42, 'r1'))).toEqual({ sortValue: 42, id: 'r1' })
    expect(parseCursor(makeCursor(null, 'r2'))).toEqual({ sortValue: null, id: 'r2' })
  })
})

describe('parseCursor rejects malformed cursors', () => {
  it.each(['garbage', Buffer.from('["x"]').toString('base64url'), Buffer.from('["x","y","z"]').toString('base64url'), Buffer.from('[1,2]').toString('base64url')])(
    'throws INVALID_CURSOR for %s',
    (cursor) => {
      expect(() => parseCursor(cursor)).toThrowError(HttpError)
      try {
        parseCursor(cursor)
      } catch (e) {
        expect((e as HttpError).code).toBe('INVALID_CURSOR')
        expect((e as HttpError).status).toBe(400)
      }
    },
  )
})
