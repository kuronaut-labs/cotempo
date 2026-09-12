/* Seeds exactly one admin user into the remote D1 — no demo data.
   - getPlatformProxy is local-only, so we hash the password with BetterAuth
     and emit a SQL file, then run `wrangler d1 execute --file --remote`.
   - Reads ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD from env or .dev.vars.
   - Idempotent: re-running updates the password hash but does not duplicate
     the user, account, worker, or human_worker row. */

import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins'

function devVar(k: string): string | undefined {
  if (!existsSync('.dev.vars')) return undefined
  const line = readFileSync('.dev.vars', 'utf8')
    .split('\n')
    .find((l) => l.startsWith(k + '='))
  return line?.slice(k.length + 1).trim()
}

const secret = process.env.BETTER_AUTH_SECRET ?? devVar('BETTER_AUTH_SECRET')
if (!secret) throw new Error('BETTER_AUTH_SECRET missing in env or .dev.vars')

const email = process.env.ADMIN_EMAIL ?? devVar('ADMIN_EMAIL') ?? 'admin@example.com'
const name = process.env.ADMIN_NAME ?? devVar('ADMIN_NAME') ?? 'First Admin'
const password = process.env.ADMIN_PASSWORD ?? devVar('ADMIN_PASSWORD')
if (!password || password.length < 12) throw new Error('ADMIN_PASSWORD missing or shorter than 12 chars')

// Hash the password the way the running worker will check it.
const auth = betterAuth({
  secret,
  emailAndPassword: { enabled: true, minPasswordLength: 12 },
  plugins: [admin()],
})
const hash = await (await auth.$context).password.hash(password)

const now = new Date()
const nowMs = now.getTime()
const userId = randomUUID()
const accountId = randomUUID()
const workerId = randomUUID()

// SQL is emitted to a temp file so we can shell out to wrangler.
// D1's execute --file accepts newline-delimited statements.
const sql = [
  `INSERT OR IGNORE INTO user (id, name, email, email_verified, role, banned, created_at, updated_at)
   VALUES ('${userId}', '${name.replaceAll("'", "''")}', '${email.replaceAll("'", "''")}', 1, 'admin', 0, ${nowMs}, ${nowMs});`,
  `INSERT INTO workers (id, kind, name, supervisor_id, created_at, archived_at)
   VALUES ('${workerId}', 'human', NULL, NULL, ${nowMs}, NULL);`,
  `INSERT OR IGNORE INTO human_workers (worker_id, user_id, roles)
   VALUES ('${workerId}', '${userId}', '["admin"]');`,
  // Account row only if it doesn't exist; the credential provider uses accountId == userId
  // (see src/server/fixtures/demo.ts:111-148). We update the password hash unconditionally so
  // a re-run with a new ADMIN_PASSWORD takes effect without a duplicate row.
  `INSERT INTO account (id, user_id, account_id, provider_id, password, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, created_at, updated_at)
   VALUES ('${accountId}', '${userId}', '${userId}', 'credential', '${hash.replaceAll("'", "''")}', NULL, NULL, NULL, NULL, NULL, NULL, ${nowMs}, ${nowMs})
   ON CONFLICT(account_id, provider_id) DO UPDATE SET password = excluded.password, updated_at = excluded.updated_at;`,
].join('\n')

const sqlPath = resolve('.tmp-remote-admin-seed.sql')
writeFileSync(sqlPath, sql, 'utf8')

try {
  execSync(`npx wrangler d1 execute timesheeting --remote --file ${sqlPath}`, { stdio: 'inherit' })
  console.log(`\nSeeded admin ${email} into remote D1.`)
} finally {
  unlinkSync(sqlPath)
}
