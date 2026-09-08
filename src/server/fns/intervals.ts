import { createServerFn } from '@tanstack/react-start'
import { CreateIntervalInput, DayQuery, DeleteIntervalInput, ListIntervalsInput, UpdateIntervalInput } from '~/lib/schemas/intervals'
import { authMw, ctxOf } from '~/server/middleware/authMw'
import { getDb } from '~/server/db'
import { getEnv } from '~/server/env'
import * as svc from '~/server/services/intervals'

const deps = () => ({ db: getDb(), tz: getEnv().ORG_TIMEZONE, now: () => new Date() })

export const createIntervalFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(CreateIntervalInput)
  .handler(({ data, context }) => svc.createInterval(deps(), ctxOf(context), data))

export const updateIntervalFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(UpdateIntervalInput)
  .handler(({ data, context }) => svc.updateInterval(deps(), ctxOf(context), data))

export const deleteIntervalFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(DeleteIntervalInput)
  .handler(({ data, context }) => svc.deleteInterval(deps(), ctxOf(context), data))

export const listDayFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(DayQuery)
  .handler(({ data, context }) => svc.listDay(deps(), ctxOf(context), data))

export const listIntervalsFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(ListIntervalsInput)
  .handler(({ data, context }) => svc.listIntervals(deps(), ctxOf(context), data))
