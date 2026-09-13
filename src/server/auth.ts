import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { eq } from 'drizzle-orm'
import { getDb, schema } from './db'
import { getEnv } from './env'
import { sendMail } from './mail'
import { activatedUserIds } from './inviteState'

const SEVEN_DAYS = 7 * 24 * 60 * 60

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      case "'": return '&#39;'
    }
    return c
  })
}

function create() {
  const env = getEnv()
  const db = getDb()
  return betterAuth({
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    // Trust the deployed APP_URL and — only when APP_URL itself is loopback —
    // other loopback ports. In production this list is exactly [APP_URL]; in
    // dev it covers the predictable :3000 base plus the :3123 port CLAUDE.md
    // uses for `npm run dev -- --port 3123`. `Origin` is attacker-controlled, so
    // a forged loopback origin would otherwise pass the check on a deployed URL.
    trustedOrigins: async (request?: Request) => {
      const origin = request?.headers.get('origin')
      if (!origin) return []
      const allow = new Set<string>([env.APP_URL])
      let appHost = ''
      try {
        appHost = new URL(env.APP_URL).hostname
      } catch {}
      if (appHost === 'localhost' || appHost === '127.0.0.1') {
        for (const port of [3000, 3123]) {
          for (const host of ['localhost', '127.0.0.1']) {
            allow.add(`http://${host}:${port}`)
          }
        }
      }
      return allow.has(origin) ? [origin] : []
    },
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      disableSignUp: true, // invite-only (#8)
      resetPasswordTokenExpiresIn: SEVEN_DAYS, // doubles as the invite token (#16)
      async sendResetPassword({ user, url }) {
        const invite = !(await activatedUserIds(db, [user.id])).has(user.id)
        await sendMail({
          to: user.email,
          subject: invite ? 'You have been added to Timesheets' : 'Reset your Timesheets password',
          // Escape user.name before interpolating into HTML — it is admin-controlled
          // free text and reaches mail clients. The link is already a URL we built
          // ourselves, so no escaping needed there. (#L7)
          html: invite
            ? `<p>${escapeHtml(user.name)}, an admin added you to Timesheets. <a href="${url}">Set your password</a> (link valid 7 days).</p>`
            : `<p><a href="${url}">Reset your password</a> (link valid 7 days).</p>`,
        })
      },
      // Completing the reset link proves the address; this is what turns an invite 'active' (#16).
      async onPasswordReset({ user }) {
        await db.update(schema.user).set({ emailVerified: true, updatedAt: new Date() }).where(eq(schema.user.id, user.id))
      },
    },
    plugins: [admin()],
  })
}

let cached: ReturnType<typeof create> | undefined
export function getAuth() {
  cached ??= create()
  return cached
}
export type Auth = ReturnType<typeof getAuth>
