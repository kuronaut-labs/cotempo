import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

const ts = (name: string) => integer(name, { mode: 'timestamp_ms' })

// ---- BetterAuth (admin plugin columns included) ----
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('user'), // admin-plugin gate only; real roles on human_workers (#8)
  banned: integer('banned', { mode: 'boolean' }).notNull().default(false),
  banReason: text('ban_reason'),
  banExpires: ts('ban_expires'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  token: text('token').notNull().unique(),
  expiresAt: ts('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  impersonatedBy: text('impersonated_by'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  password: text('password'),
  // Unused with email+password only, but the drizzle adapter refuses to start without them.
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: ts('access_token_expires_at'),
  refreshTokenExpiresAt: ts('refresh_token_expires_at'),
  scope: text('scope'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: ts('expires_at').notNull(),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
})

// ---- Workers ----
export const workers = sqliteTable('workers', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['human', 'agent'] }).notNull(),
  name: text('name'), // agents only; humans use user.name
  supervisorId: text('supervisor_id'), // must be a human worker (app-enforced)
  createdAt: ts('created_at').notNull(),
  archivedAt: ts('archived_at'),
})

export const humanWorkers = sqliteTable('human_workers', {
  workerId: text('worker_id')
    .primaryKey()
    .references(() => workers.id),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id),
  roles: text('roles').notNull().default('["operator"]'), // JSON array (#5/#8)
})

export const agentWorkers = sqliteTable('agent_workers', {
  workerId: text('worker_id')
    .primaryKey()
    .references(() => workers.id),
  model: text('model').notNull(),
  framework: text('framework').notNull(),
  status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
})

// ---- Structure ----
export const clients = sqliteTable('clients', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: ts('created_at').notNull(),
  archivedAt: ts('archived_at'),
})

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  clientId: text('client_id')
    .notNull()
    .references(() => clients.id),
  name: text('name').notNull(),
  createdAt: ts('created_at').notNull(),
  archivedAt: ts('archived_at'),
})

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  name: text('name').notNull(),
  billableRateCents: integer('billable_rate_cents'), // null = non-billable, 0 = billable at $0 (#18)
  createdAt: ts('created_at').notNull(),
  archivedAt: ts('archived_at'),
})

// ---- Intervals ----
export const intervals = sqliteTable(
  'intervals',
  {
    id: text('id').primaryKey(),
    workerId: text('worker_id')
      .notNull()
      .references(() => workers.id),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id),
    startedAt: ts('started_at').notNull(),
    endedAt: ts('ended_at').notNull(),
    rateCents: integer('rate_cents'), // snapshot of job rate at create / job change (#18)
    note: text('note'),
    createdBy: text('created_by')
      .notNull()
      .references(() => workers.id),
    editCount: integer('edit_count').notNull().default(0),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('intervals_worker_start').on(t.workerId, t.startedAt).where(sql`${t.deletedAt} IS NULL`),
    index('intervals_job_start').on(t.jobId, t.startedAt).where(sql`${t.deletedAt} IS NULL`),
    index('intervals_start').on(t.startedAt).where(sql`${t.deletedAt} IS NULL`),
  ],
)

// ---- Approvals (#12, #23, #26) ----
export const approvals = sqliteTable(
  'approvals',
  {
    id: text('id').primaryKey(),
    workerId: text('worker_id')
      .notNull()
      .references(() => workers.id),
    weekStart: text('week_start').notNull(), // 'YYYY-MM-DD' local Monday in org tz; the one non-ms date
    status: text('status', { enum: ['draft', 'submitted', 'approved', 'rejected'] }).notNull().default('draft'),
    submittedAt: ts('submitted_at'),
    submittedBy: text('submitted_by'),
    approvedAt: ts('approved_at'),
    approvedBy: text('approved_by'),
    approvedComment: text('approved_comment'),
    rejectedAt: ts('rejected_at'),
    rejectedBy: text('rejected_by'),
    rejectedReason: text('rejected_reason'),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [uniqueIndex('approvals_worker_week').on(t.workerId, t.weekStart)],
)

export const approvalEvents = sqliteTable('approval_events', {
  id: text('id').primaryKey(),
  approvalId: text('approval_id')
    .notNull()
    .references(() => approvals.id),
  kind: text('kind', { enum: ['submit', 'approve', 'reject', 'unlock', 'edited_after_submit'] }).notNull(),
  actorWorkerId: text('actor_worker_id')
    .notNull()
    .references(() => workers.id),
  reason: text('reason'),
  at: ts('at').notNull(),
})

// ---- Leave ----
// minutesPerYear / minutesPerDay / accrualRatePer10k are integer minutes;
// minutes never round (#23-adjacent). accrualRatePer10k = leave minutes
// accrued per 10,000 worked minutes (12.07% UK part-time = 1207).
export const leaveTypes = sqliteTable('leave_types', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  paid: integer('paid', { mode: 'boolean' }).notNull().default(true),
  accrualMethod: text('accrual_method').notNull().default('monthly_prorata'),
  minutesPerYear: integer('minutes_per_year').notNull().default(0),
  accrualRatePer10k: integer('accrual_rate_per_10k').notNull().default(0),
  maxCarryOverMinutes: integer('max_carry_over_minutes').notNull().default(0),
  yearBasis: text('year_basis').notNull().default('calendar'),
  archivedAt: ts('archived_at'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
})

export const leaveRequests = sqliteTable(
  'leave_requests',
  {
    id: text('id').primaryKey(),
    workerId: text('worker_id')
      .notNull()
      .references(() => workers.id),
    typeId: text('type_id')
      .notNull()
      .references(() => leaveTypes.id),
    startDay: text('start_day').notNull(), // 'YYYY-MM-DD' org tz, like approvals.weekStart
    endDay: text('end_day').notNull(),
    minutesPerDay: integer('minutes_per_day').notNull(),
    status: text('status', { enum: ['submitted', 'approved', 'rejected', 'cancelled'] }).notNull().default('submitted'),
    reason: text('reason'),
    submittedAt: ts('submitted_at').notNull(),
    submittedBy: text('submitted_by').notNull(),
    decidedAt: ts('decided_at'),
    decidedBy: text('decided_by'),
    decisionReason: text('decision_reason'),
  },
  (t) => [index('leave_requests_worker_status_idx').on(t.workerId, t.status), index('leave_requests_status_idx').on(t.status)],
)

export const leaveEvents = sqliteTable('leave_events', {
  id: text('id').primaryKey(),
  requestId: text('request_id')
    .notNull()
    .references(() => leaveRequests.id),
  kind: text('kind', { enum: ['submit', 'approve', 'reject', 'cancel'] }).notNull(),
  actorWorkerId: text('actor_worker_id').notNull(),
  reason: text('reason'),
  at: ts('at').notNull(),
})

// ---- Org settings (#3: single row, id 'org') ----
export const orgSettings = sqliteTable('org_settings', {
  id: text('id').primaryKey(),
  defaultBillableRateCents: integer('default_billable_rate_cents'),
  defaultDayMinutes: integer('default_day_minutes').notNull().default(480),
  defaultWeeklyTargetHours: integer('default_weekly_target_hours'),
  updatedAt: ts('updated_at').notNull(),
})
