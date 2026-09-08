import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { eq } from 'drizzle-orm'
import { getDb, schema } from './db'
import { getEnv } from './env'
import { sendMail } from './mail'

const SEVEN_DAYS = 7 * 24 * 60 * 60

function create() {
  const env = getEnv()
  const db = getDb()
  return betterAuth({
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
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
        // A user who has never had a session is being invited, not resetting.
        const hasSession = await db
          .select({ id: schema.session.id })
          .from(schema.session)
          .where(eq(schema.session.userId, user.id))
          .get()
        const invite = !hasSession
        await sendMail({
          to: user.email,
          subject: invite ? 'You have been added to Timesheets' : 'Reset your Timesheets password',
          html: invite
            ? `<p>${user.name}, an admin added you to Timesheets. <a href="${url}">Set your password</a> (link valid 7 days).</p>`
            : `<p><a href="${url}">Reset your password</a> (link valid 7 days).</p>`,
        })
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
