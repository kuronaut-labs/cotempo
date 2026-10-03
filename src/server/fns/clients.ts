import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  ArchiveContactInput,
  CreateContactInput,
  ListClientsInput,
  SetPrimaryContactInput,
  UpdateClientDetailsInput,
  UpdateContactInput,
} from '~/lib/schemas/clients'
import { authMw, ctxOf } from '~/server/middleware/authMw'
import { requireRole } from '~/server/middleware/roleGuard'
import { runtimeDeps } from '~/server/runtimeDeps'
import * as svc from '~/server/services/clients'

export type { ClientDetail, ClientListRow, ContactView } from '~/server/services/clients'

const adminOnly = [authMw, requireRole('admin')]

export const listClientsFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(ListClientsInput)
  .handler(({ data, context }) => svc.listClients(runtimeDeps(), ctxOf(context), data))

export const getClientFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(({ data, context }) => svc.getClient(runtimeDeps(), ctxOf(context), data))

export const updateClientDetailsFn = createServerFn({ method: 'POST' })
  .middleware(adminOnly)
  .validator(UpdateClientDetailsInput)
  .handler(({ data, context }) => svc.updateClientDetails(runtimeDeps(), ctxOf(context), data))

export const createContactFn = createServerFn({ method: 'POST' })
  .middleware(adminOnly)
  .validator(CreateContactInput)
  .handler(({ data, context }) => svc.createContact(runtimeDeps(), ctxOf(context), data))

export const updateContactFn = createServerFn({ method: 'POST' })
  .middleware(adminOnly)
  .validator(UpdateContactInput)
  .handler(({ data, context }) => svc.updateContact(runtimeDeps(), ctxOf(context), data))

export const archiveContactFn = createServerFn({ method: 'POST' })
  .middleware(adminOnly)
  .validator(ArchiveContactInput)
  .handler(({ data, context }) => svc.archiveContact(runtimeDeps(), ctxOf(context), data))

export const setPrimaryContactFn = createServerFn({ method: 'POST' })
  .middleware(adminOnly)
  .validator(SetPrimaryContactInput)
  .handler(({ data, context }) => svc.setPrimaryContact(runtimeDeps(), ctxOf(context), data))

