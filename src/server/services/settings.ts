import { eq } from 'drizzle-orm'
import { schema } from '~/server/db'
import { canSeeMoney, isAdmin, type SessionContext } from '~/server/context'
import { HttpError } from '~/lib/errors'
import { OrgSettingsInput, type OrgSettingsView } from '~/lib/schemas/settings'

export type { OrgSettingsView }
import type { Deps } from './deps'

export const FALLBACK_DAY_MINUTES = 480

export async function getOrgSettings(deps: Deps, ctx: SessionContext): Promise<OrgSettingsView> {
  const [row] = await deps.db.select().from(schema.orgSettings).where(eq(schema.orgSettings.id, 'org'))
  // The rate key is omitted, never null/0, for non-money roles (#5).
  const view: OrgSettingsView = {
    defaultDayMinutes: row?.defaultDayMinutes ?? FALLBACK_DAY_MINUTES,
    defaultWeeklyTargetHours: row?.defaultWeeklyTargetHours ?? null,
  }
  if (canSeeMoney(ctx)) view.defaultBillableRateCents = row?.defaultBillableRateCents ?? null
  return view
}

export async function updateOrgSettings(deps: Deps, ctx: SessionContext, input: OrgSettingsInput): Promise<OrgSettingsView> {
  if (!isAdmin(ctx)) throw new HttpError(403, 'FORBIDDEN')
  const patch: Partial<typeof schema.orgSettings.$inferInsert> = {}
  if (input.defaultBillableRateCents !== undefined) patch.defaultBillableRateCents = input.defaultBillableRateCents
  if (input.defaultDayMinutes !== undefined) patch.defaultDayMinutes = input.defaultDayMinutes
  if (input.defaultWeeklyTargetHours !== undefined) patch.defaultWeeklyTargetHours = input.defaultWeeklyTargetHours
  if (Object.keys(patch).length > 0) {
    patch.updatedAt = deps.now()
    await deps.db
      .insert(schema.orgSettings)
      .values({ id: 'org', defaultBillableRateCents: null, defaultDayMinutes: FALLBACK_DAY_MINUTES, defaultWeeklyTargetHours: null, updatedAt: patch.updatedAt as Date, ...patch })
      .onConflictDoUpdate({ target: schema.orgSettings.id, set: patch })
  }
  return getOrgSettings(deps, ctx)
}
