import { createServerFn } from '@tanstack/react-start'
import { localDateOf } from '~/lib/dayMath'
import { CreateIntervalInput, DayQuery, DeleteIntervalInput, GetRecentJobsInput, ListIntervalsInput, UpdateIntervalInput } from '~/lib/schemas/intervals'
import { authMw, ctxOf } from '~/server/middleware/authMw'
import { runtimeDeps } from '~/server/runtimeDeps'
import * as svc from '~/server/services/intervals'

/* Strip money keys before the row crosses the wire (#5): operators call these
   fns and must never see rateCents. The service still returns the full row for
   contract tests, so the wire boundary is the fn. */
function omitRateCents<T extends { rateCents: number | null }>(row: T): Omit<T, 'rateCents'> {
  const { rateCents: _drop, ...rest } = row
  return rest
}

export const createIntervalFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(CreateIntervalInput)
  .handler(async ({ data, context }) => omitRateCents(await svc.createInterval(runtimeDeps(), ctxOf(context), data)))

export const updateIntervalFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(UpdateIntervalInput)
  .handler(async ({ data, context }) => omitRateCents(await svc.updateInterval(runtimeDeps(), ctxOf(context), data)))

export const deleteIntervalFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(DeleteIntervalInput)
  .handler(({ data, context }) => svc.deleteInterval(runtimeDeps(), ctxOf(context), data))

export const listDayFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(DayQuery)
  .handler(({ data, context }) => svc.listDay(runtimeDeps(), ctxOf(context), data))

export const listIntervalsFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(ListIntervalsInput)
  .handler(({ data, context }) => svc.listIntervals(runtimeDeps(), ctxOf(context), data))

// The browser never picks a zone or reads its own clock (#23).
export const getTodayFn = createServerFn({ method: 'GET' }).handler(() => {
  const { tz } = runtimeDeps()
  return { date: localDateOf(Date.now(), tz), tz }
})

export const getRecentJobsFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(GetRecentJobsInput)
  .handler(({ data, context }) => svc.getRecentJobs(runtimeDeps(), ctxOf(context), data))
