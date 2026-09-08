/** True if `key` appears anywhere in a nested plain object/array (#5: operators never receive money keys). */
export function deepHasKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((v) => deepHasKey(v, key))
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if (key in (value as Record<string, unknown>)) return true
    return Object.values(value as Record<string, unknown>).some((v) => deepHasKey(v, key))
  }
  return false
}

/** ISO instant for a Perth (UTC+8, no DST) wall-clock time. */
export const perth = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+08:00`).toISOString()
export const perthMs = (date: string, hhmm: string) => Date.parse(perth(date, hhmm))

export async function expectCode(p: Promise<unknown>, code: string, extra?: Record<string, unknown>) {
  let err: unknown
  try {
    await p
  } catch (e) {
    err = e
  }
  if (!err) throw new Error(`expected rejection with ${code}, but it resolved`)
  const e = err as { code?: string; message?: string }
  if (e.code !== code) throw new Error(`expected code ${code}, got ${e.code ?? e.message}`)
  if (extra) for (const [k, v] of Object.entries(extra)) if ((e as Record<string, unknown>)[k] !== v) throw new Error(`expected ${k}=${String(v)}, got ${String((e as Record<string, unknown>)[k])}`)
}
