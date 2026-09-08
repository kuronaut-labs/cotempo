import { readFileSync } from 'node:fs'
import { getPlatformProxy } from 'wrangler'
import { drizzle } from 'drizzle-orm/d1'
import { betterAuth } from 'better-auth'
import * as schema from '../drizzle/schema'
import { insertDemo, seedAuthUsers, demoHumans, ids } from '../src/server/fixtures/demo'

const devVar = (k: string) => {
  const line = readFileSync('.dev.vars', 'utf8')
    .split('\n')
    .find((l) => l.startsWith(k + '='))
  if (!line) throw new Error(`Missing ${k} in .dev.vars`)
  return line.slice(k.length + 1).trim()
}

const { env, dispose } = await getPlatformProxy<{ DB: D1Database; ORG_TIMEZONE: string }>({ configPath: 'wrangler.jsonc' })
const db = drizzle(env.DB, { schema })
// Only used for its password hasher; adapter config is irrelevant here.
const auth = betterAuth({ secret: devVar('BETTER_AUTH_SECRET'), emailAndPassword: { enabled: true } })

// Anchor the demo week to the current ISO Monday so /today has data.
const today = new Date()
today.setUTCHours(0, 0, 0, 0)
const dow = today.getUTCDay()
const monday = today.getTime() - (dow === 0 ? 6 : dow - 1) * 86_400_000

await insertDemo(db, { anchorMs: monday })
await seedAuthUsers(db, auth, [
  {
    workerId: ids.adminWorker,
    email: devVar('ADMIN_EMAIL'),
    name: devVar('ADMIN_NAME'),
    password: devVar('ADMIN_PASSWORD'),
    roles: ['operator', 'billing', 'admin'],
  },
  ...demoHumans.filter((h) => h.workerId !== ids.adminWorker).map((h) => ({ ...h, password: 'demo-password-123' })),
])
await dispose()
console.log('seeded')
