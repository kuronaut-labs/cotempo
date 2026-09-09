import { and, eq, inArray } from 'drizzle-orm'
import { schema, type Db } from '~/server/db'

/* Activated = has a credential account and a verified email. Sessions are pruned when
   they expire, so they cannot tell "never signed in" from "away a while" (#16). */
export async function activatedUserIds(db: Db, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const rows = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .innerJoin(schema.account, eq(schema.account.userId, schema.user.id))
    .where(and(inArray(schema.user.id, userIds), eq(schema.user.emailVerified, true), eq(schema.account.providerId, 'credential')))
    .all()
  return new Set(rows.map((r) => r.id))
}
