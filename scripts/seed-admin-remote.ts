/* Seeds exactly one admin user into the remote D1 — no demo data.
   - getPlatformProxy is local-only, so we hash the password with BetterAuth
     and emit a SQL file, then run `wrangler d1 execute --file --remote`.
   - True idempotency: a pre-query resolves any existing user/worker ids so
     re-running does not mint fresh UUIDs that collide on FK or duplicate rows.
     The previous version generated new ids each run, which left an orphan
     `workers` row on a re-run when the user row already existed (#M3).
   - Reads ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD from env or .dev.vars. */

import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins'

function devVar(k: string): string | undefined {
  try {
    const line = readFileSync('.dev.vars', 'utf8')
      .split('\n')
      .find((l) => l.startsWith(k + '='))
    return line?.slice(k.length + 1).trim()
  } catch {
    return undefined
  }
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

const esc = (s: string) => s.replaceAll("'", "''")

// Pre-query the existing user and worker. If both exist, only the account
// password is refreshed. If only the user exists, the worker + human_workers
// rows are added. Otherwise everything is inserted.
let existingUserId: string | null = null
let existingWorkerId: string | null = null
try {
  const lookup = `SELECT u.id AS user_id, hw.worker_id AS worker_id FROM user u LEFT JOIN human_workers hw ON hw.user_id = u.id WHERE u.email = '${esc(email)}'`
  const out = execSync(`npx wrangler d1 execute timesheeting --remote --command ${JSON.stringify(lookup)} --json`, { encoding: 'utf8' })
  const parsed = JSON.parse(out) as Array<{ results?: Array<{ user_id: string | null; worker_id: string | null }> }>
  const row = parsed[0]?.results?.[0]
  existingUserId = row?.user_id ?? null
  existingWorkerId = row?.worker_id ?? null
} catch (e) {
  // Empty remote DB (no tables yet) or transient CLI failure: treat as fresh.
  console.warn('pre-query skipped:', e instanceof Error ? e.message : e)
}

const nowMs = Date.now()
// account.id == userId per the credential provider convention used in
// src/server/fixtures/demo.ts. That makes the account row idempotent under
// `ON CONFLICT(id) DO UPDATE`.
const userId = existingUserId ?? randomUUID()
const workerId = existingWorkerId ?? randomUUID()
const accountId = userId

const stmts: string[] = []
if (!existingUserId) {
  stmts.push(
    `INSERT INTO user (id, name, email, email_verified, role, banned, created_at, updated_at) VALUES ('${userId}', '${esc(name)}', '${esc(email)}', 1, 'admin', 0, ${nowMs}, ${nowMs});`,
  )
}
if (!existingWorkerId) {
  stmts.push(
    `INSERT INTO workers (id, kind, name, supervisor_id, created_at, archived_at) VALUES ('${workerId}', 'human', NULL, NULL, ${nowMs}, NULL);`,
    `INSERT INTO human_workers (worker_id, user_id, roles) VALUES ('${workerId}', '${userId}', '["admin"]');`,
  )
}
// Always upsert the account so a re-run with a new ADMIN_PASSWORD takes effect.
stmts.push(
  `INSERT INTO account (id, user_id, account_id, provider_id, password, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, created_at, updated_at) VALUES ('${accountId}', '${userId}', '${userId}', 'credential', '${esc(hash)}', NULL, NULL, NULL, NULL, NULL, NULL, ${nowMs}, ${nowMs}) ON CONFLICT(id) DO UPDATE SET password = excluded.password, updated_at = excluded.updated_at;`,
)

const dir = mkdtempSync(join(tmpdir(), 'timesheeting-seed-'))
const sqlPath = join(dir, 'remote-admin-seed.sql')
writeFileSync(sqlPath, stmts.join('\n'), 'utf8')

try {
  execSync(`npx wrangler d1 execute timesheeting --remote --file ${sqlPath}`, { stdio: 'inherit' })
  console.log(`\nSeeded admin ${email} into remote D1.`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
