import { getDb } from '~/server/db'
import { getEnv } from '~/server/env'
import type { Deps } from '~/server/services/deps'

/* Call only inside a server fn handler. Referencing getDb/getEnv at module scope in a
   fn file keeps `cloudflare:workers` in the client bundle, which cannot resolve it (#20). */
export const runtimeDeps = (): Deps => ({ db: getDb(), tz: getEnv().ORG_TIMEZONE, now: () => new Date() })
