import type { SessionContext } from '~/server/context'
import type {
  ArchiveInput,
  CreateClientInput,
  CreateJobInput,
  CreateProjectInput,
  ListStructureInput,
  UpdateClientInput,
  UpdateJobInput,
  UpdateProjectInput,
} from '~/lib/schemas/structure'
import type { Deps } from './deps'

export type JobNode = { id: string; name: string; archivedAt: Date | null; billableRateCents?: number | null }
export type ProjectNode = { id: string; name: string; archivedAt: Date | null; jobs: JobNode[] }
export type ClientNode = { id: string; name: string; archivedAt: Date | null; projects: ProjectNode[] }

/** Tree of clients → projects → jobs. `billableRateCents` present only when canSeeMoney(ctx) (#5). */
export async function listStructure(_deps: Deps, _ctx: SessionContext, _input: ListStructureInput): Promise<ClientNode[]> {
  throw new Error('TODO Task 4.2')
}

export async function createClient(_deps: Deps, _ctx: SessionContext, _input: CreateClientInput): Promise<{ id: string }> {
  throw new Error('TODO Task 4.2')
}
export async function updateClient(_deps: Deps, _ctx: SessionContext, _input: UpdateClientInput): Promise<void> {
  throw new Error('TODO Task 4.2')
}
export async function archiveClient(_deps: Deps, _ctx: SessionContext, _input: ArchiveInput): Promise<void> {
  throw new Error('TODO Task 4.2')
}

export async function createProject(_deps: Deps, _ctx: SessionContext, _input: CreateProjectInput): Promise<{ id: string }> {
  throw new Error('TODO Task 4.2')
}
export async function updateProject(_deps: Deps, _ctx: SessionContext, _input: UpdateProjectInput): Promise<void> {
  throw new Error('TODO Task 4.2')
}
export async function archiveProject(_deps: Deps, _ctx: SessionContext, _input: ArchiveInput): Promise<void> {
  throw new Error('TODO Task 4.2')
}

export async function createJob(_deps: Deps, _ctx: SessionContext, _input: CreateJobInput): Promise<{ id: string }> {
  throw new Error('TODO Task 4.2')
}
/** Changing `billableRateCents` never touches existing intervals' `rate_cents` (#18). */
export async function updateJob(_deps: Deps, _ctx: SessionContext, _input: UpdateJobInput): Promise<void> {
  throw new Error('TODO Task 4.2')
}
export async function archiveJob(_deps: Deps, _ctx: SessionContext, _input: ArchiveInput): Promise<void> {
  throw new Error('TODO Task 4.2')
}
