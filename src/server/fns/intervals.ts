import { createServerFn } from '@tanstack/react-start'
import { localDateOf } from '~/lib/dayMath'
import { CreateIntervalInput, DayQuery, DeleteIntervalInput, ListIntervalsInput, UpdateIntervalInput } from '~/lib/schemas/intervals'
import { authMw, ctxOf } from '~/server/middleware/authMw'
import { runtimeDeps } from '~/server/runtimeDeps'
import * as svc from '~/server/services/intervals'

export const createIntervalFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(CreateIntervalInput)
  .handler(({ data, context }) => svc.createInterval(runtimeDeps(), ctxOf(context), data))

export const updateIntervalFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(UpdateIntervalInput)
  .handler(({ data, context }) => svc.updateInterval(runtimeDeps(), ctxOf(context), data))

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

// Server's local date in the org tz; the /today route uses this when the URL has no ?date (#23).
export const getTodayFn = createServerFn({ method: 'GET' }).handler(() => localDateOf(Date.now(), runtimeDeps().tz))
