import { createServerFn } from '@tanstack/react-start'
import { ListClientsInput } from '~/lib/schemas/clients'
import { authMw, ctxOf } from '~/server/middleware/authMw'
import { runtimeDeps } from '~/server/runtimeDeps'
import { listClients } from '~/server/services/clients'

export const listClientsFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(ListClientsInput)
  .handler(({ data, context }) => listClients(runtimeDeps(), ctxOf(context), data))
