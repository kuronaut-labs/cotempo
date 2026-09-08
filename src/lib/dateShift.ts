/** Date arithmetic helpers for components (#4.4a). Input/output are ISO 'YYYY-MM-DD' strings. */

const DAY_MS = 86_400_000
const pad = (n: number) => String(n).padStart(2, '0')

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d))
}

export function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Add `days` whole UTC days to a `Date` parsed from an ISO string. Negative shifts back. */
export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + Math.trunc(days) * DAY_MS)
}
