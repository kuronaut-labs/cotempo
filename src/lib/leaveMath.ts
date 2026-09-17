import type { AccrualMethod, YearBasis } from '~/lib/schemas/leave'

export type LeavePolicy = {
  key: string
  accrualMethod: AccrualMethod
  minutesPerYear: number
  accrualRatePer10k: number
  maxCarryOverMinutes: number
  yearBasis: YearBasis
}

export type AccrualYear = { startDay: string; endDay: string }

const MS_PER_DAY = 86_400_000
const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`)
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function accrualYears(policy: LeavePolicy, accrualStartDay: string, asOfDay: string): AccrualYear[] {
  const start = dayMs(accrualStartDay)
  const asOf = dayMs(asOfDay)
  if (asOf < start) return []
  const years: AccrualYear[] = []
  if (policy.yearBasis === 'calendar') {
    const y0 = Number(accrualStartDay.slice(0, 4))
    for (let y = y0; ; y++) {
      const s = `${y}-01-01`
      if (dayMs(s) > asOf) break
      years.push({ startDay: s, endDay: `${y}-12-31` })
    }
  } else {
    const y0 = Number(accrualStartDay.slice(0, 4))
    const md = accrualStartDay.slice(5)
    for (let y = y0; ; y++) {
      const s = y === y0 ? accrualStartDay : `${y}-${md}`
      if (dayMs(s) > asOf) break
      const y1 = Number(s.slice(0, 4)) + 1
      const endDay = md === '02-29' ? `${y1}-02-28` : isoDay(dayMs(`${y1}-${md}`) - MS_PER_DAY)
      years.push({ startDay: s, endDay }) // endDay = day before next anniversary
    }
    // endDay is inclusive: the day before the next window's start (tests rely on it).
    years.forEach((y, i) => {
      const next = years[i + 1]?.startDay
      y.endDay = next ? isoDay(dayMs(next) - MS_PER_DAY) : y.endDay
    })
  }
  return years
}

function completedMonthsInWindow(yearStartDay: string, accrualStartDay: string, asOfDay: string): number {
  const hire = dayMs(accrualStartDay)
  const effective = Math.max(dayMs(yearStartDay), hire)
  let months = (Number(asOfDay.slice(0, 4)) - Number(isoDay(effective).slice(0, 4))) * 12
  months += Number(asOfDay.slice(5, 7)) - Number(isoDay(effective).slice(5, 7))
  if (Number(asOfDay.slice(8, 10)) < Number(isoDay(effective).slice(8, 10))) months -= 1
  return Math.max(0, months)
}

export function grantedMinutes(
  policy: LeavePolicy, yearStartDay: string, accrualStartDay: string, asOfDay: string, workedMinutesInYear: number,
): number {
  if (dayMs(asOfDay) < dayMs(yearStartDay > accrualStartDay ? yearStartDay : accrualStartDay)) return 0
  if (policy.accrualMethod === 'annual_allotment') return policy.minutesPerYear
  if (policy.accrualMethod === 'monthly_prorata') {
    const months = completedMonthsInWindow(yearStartDay, accrualStartDay, asOfDay)
    return Math.floor((policy.minutesPerYear * months) / 12)
  }
  return Math.floor((workedMinutesInYear * policy.accrualRatePer10k) / 10_000)
}

export function carryOverMinutes(policy: LeavePolicy, unusedMinutesAtYearEnd: number): number {
  return Math.min(Math.max(0, unusedMinutesAtYearEnd), policy.maxCarryOverMinutes)
}

export function computeAvailableMinutes(
  policy: LeavePolicy, accrualStartDay: string, asOfDay: string,
  usedMinutesByYear: number[], workedMinutesByYear: number[],
): number {
  const years = accrualYears(policy, accrualStartDay, asOfDay)
  const last = years.length - 1
  let available = 0
  years.forEach((y, i) => {
    // Completed years grant up to their window end, not the current asOf.
    const asOfForYear = i === last ? asOfDay : (dayMs(asOfDay) < dayMs(y.endDay) ? asOfDay : y.endDay)
    const carried = i === 0 ? 0 : carryOverMinutes(policy, available)
    available = carried + grantedMinutes(policy, y.startDay, accrualStartDay, asOfForYear, workedMinutesByYear[i] ?? 0) - (usedMinutesByYear[i] ?? 0)
  })
  return Math.max(0, available)
}

export function daysInclusive(startDay: string, endDay: string): number {
  return Math.round((dayMs(endDay) - dayMs(startDay)) / MS_PER_DAY) + 1
}

export function requestMinutes(startDay: string, endDay: string, minutesPerDay: number): number {
  return daysInclusive(startDay, endDay) * minutesPerDay
}
