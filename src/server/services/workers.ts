import type { SessionContext } from '~/server/context'
import type { Role } from '~/server/context'
import type {
  AgentWorkerInput,
  ArchiveWorkerInput,
  SetRolesInput,
  SetSupervisorInput,
  UpdateAgentWorkerInput,
} from '~/lib/schemas/workers'
import type { Deps } from './deps'

export type HumanWorkerView = {
  workerId: string
  kind: 'human'
  name: string
  email: string
  roles: Role[]
  supervisorId: string | null
  inviteState: 'pending' | 'active' // pending = no session row has ever existed (#16)
}
export type AgentWorkerView = {
  workerId: string
  kind: 'agent'
  name: string
  model: string
  framework: string
  status: 'active' | 'inactive'
  supervisorId: string | null
}
export type WorkerView = HumanWorkerView | AgentWorkerView

/** Unarchived workers. Operators receive only self + supervisees; billing/admin everyone. */
export async function listWorkers(_deps: Deps, _ctx: SessionContext): Promise<WorkerView[]> {
  throw new Error('TODO Task 4.2')
}

/** `supervisorId` must be an unarchived human worker, else HttpError(400, 'SUPERVISOR_NOT_HUMAN', 'supervisorId'). */
export async function createAgentWorker(_deps: Deps, _ctx: SessionContext, _input: AgentWorkerInput): Promise<{ workerId: string }> {
  throw new Error('TODO Task 4.2')
}

export async function updateAgentWorker(_deps: Deps, _ctx: SessionContext, _input: UpdateAgentWorkerInput): Promise<void> {
  throw new Error('TODO Task 4.2')
}

/** Roles must keep 'operator' (Zod enforces; service re-checks and throws ROLES_MUST_INCLUDE_OPERATOR). */
export async function setRoles(_deps: Deps, _ctx: SessionContext, _input: SetRolesInput): Promise<void> {
  throw new Error('TODO Task 4.2')
}

/** Supervisor must be a human or null; a human may supervise humans. */
export async function setSupervisor(_deps: Deps, _ctx: SessionContext, _input: SetSupervisorInput): Promise<void> {
  throw new Error('TODO Task 4.2')
}

/** Refuses with HttpError(409, 'HAS_SUPERVISEES') while unarchived supervisees remain. */
export async function archiveWorker(_deps: Deps, _ctx: SessionContext, _input: ArchiveWorkerInput): Promise<void> {
  throw new Error('TODO Task 4.2')
}
