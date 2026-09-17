import { createServerFn } from '@tanstack/react-start'
import { OrgSettingsInput } from '~/lib/schemas/settings'
import { authMw, ctxOf } from '~/server/middleware/authMw'
import { runtimeDeps } from '~/server/runtimeDeps'
import * as svc from '~/server/services/settings'

export const getOrgSettingsFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .handler(({ context }) => svc.getOrgSettings(runtimeDeps(), ctxOf(context)))

export const updateOrgSettingsFn = createServerFn({ method: 'POST' })
  .middleware([authMw])
  .validator(OrgSettingsInput)
  .handler(({ data, context }) => svc.updateOrgSettings(runtimeDeps(), ctxOf(context), data))

export type { OrgSettingsView } from '~/server/services/settings'
export type { OrgSettingsInput } from '~/lib/schemas/settings'
