/** Σ minutes × rate / 60, rounded half-up once for the whole grouping (#18). Null rate = non-billable. */
export function moneyCents(rows: { minutes: number; rateCents: number | null }[]): number {
  const numerator = rows.reduce((s, r) => s + r.minutes * (r.rateCents ?? 0), 0)
  return Math.floor(numerator / 60 + 0.5)
}

/** Minutes as 'h:mm' for entry screens (#13). */
export function formatHmm(minutes: number): string {
  const h = Math.floor(minutes / 60)
  return `${h}:${String(minutes % 60).padStart(2, '0')}`
}

/** Minutes as decimal hours 'h.hh' for reports (#11). Hours never round in storage; this is display only. */
export function formatDecimalHours(minutes: number): string {
  return (minutes / 60).toFixed(2)
}
