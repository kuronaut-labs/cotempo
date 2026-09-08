import type { Db } from '~/server/db'

/** Everything a service function needs from the runtime; fns build it, tests fake it. */
export type Deps = { db: Db; tz: string; now: () => Date }
