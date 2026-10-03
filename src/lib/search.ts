import { HttpError } from '~/lib/errors'

/* Shared search + keyset-cursor helpers for list services (#20: pure lib, no server imports). */

export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

/** Cursor payload: `(sortValue, id)` of the last returned row, base64url of a JSON array. */
export function makeCursor(sortValue: string | number | null, id: string): string {
  return Buffer.from(JSON.stringify([sortValue, id]), 'utf8').toString('base64url')
}

export function parseCursor(cursor: string): { sortValue: string | number | null; id: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    throw new HttpError(400, 'INVALID_CURSOR', 'cursor')
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) throw new HttpError(400, 'INVALID_CURSOR', 'cursor')
  const [sortValue, id] = parsed as [unknown, unknown]
  if (id !== null && typeof id !== 'string') throw new HttpError(400, 'INVALID_CURSOR', 'cursor')
  if (sortValue !== null && typeof sortValue !== 'string' && typeof sortValue !== 'number') {
    throw new HttpError(400, 'INVALID_CURSOR', 'cursor')
  }
  return { sortValue: sortValue as string | number | null, id: id as string }
}
