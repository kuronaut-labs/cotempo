/* Pure HH:MM maths for the entry form. Instants are built only in entryForm's
   combine(); everything here works in minutes and 'HH:MM' strings (#19/#22). */

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  return h * 60 + m
}

function toHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** A local end ≤ its start means the entry ends on the next day (LD9). */
export function crossesMidnight(startHHMM: string, endHHMM: string): boolean {
  return toMin(endHHMM) <= toMin(startHHMM)
}

/** Signed span start→end in minutes; end ≤ start wraps to the next day. */
export function durationBetween(startHHMM: string, endHHMM: string): number {
  const d = toMin(endHHMM) - toMin(startHHMM)
  return d < 0 ? d + 1440 : d
}

/** Start + duration (minutes) → { end, crossesMidnight }. */
export function endFromDuration(startHHMM: string, durationMin: number): { end: string; crossesMidnight: boolean } {
  const total = toMin(startHHMM) + durationMin
  return { end: toHHMM(total), crossesMidnight: total >= 1440 }
}
