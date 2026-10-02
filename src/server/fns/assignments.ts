import { createServerFn } from '@tanstack/react-start'
import {
  ArchiveAssignmentInput,
  CreateAssignmentInput,
  ListAssignmentsInput,
  UpdateAssignmentInput,
} from '~/lib/schemas/assignments'
import { authMw, ctxOf } from '~/server/middleware/authMw'
import { requireRole } from '~/server/middleware/roleGuard'
import { runtimeDeps } from '~/server/runtimeDeps'
import * as svc from '~/server/services/assignments'

export type { AssignmentView } from '~/server/services/assignments'

const adminOnly = [authMw, requireRole('admin')]

export const listAssignmentsFn = createServerFn({ method: 'GET' })
  .middleware([authMw])
  .validator(ListAssignmentsInput)
  .handler(({ data, context }) => svc.listAssignments(runtimeDeps(), ctxOf(context), data))

export const createAssignmentFn = createServerFn({ method: 'POST' })
  .middleware(adminOnly)
  .validator(CreateAssignmentInput)
  .handler(({ data, context }) => svc.createAssignment(runtimeDeps(), ctxOf(context), data))

export const updateAssignmentFn = createServerFn({ method: 'POST' })
  .middleware(adminOnly)
  .validator(UpdateAssignmentInput)
  .handler(({ data, context }) => svc.updateAssignment(runtimeDeps(), ctxOf(context), data))

export const archiveAssignmentFn = createServerFn({ method: 'POST' })
  .middleware(adminOnly)
  .validator(ArchiveAssignmentInput)
  .handler(({ data, context }) => svc.archiveAssignment(runtimeDeps(), ctxOf(context), data))
