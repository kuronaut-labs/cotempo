import { env as bindings } from 'cloudflare:workers'
import { z } from 'zod'

const EnvSchema = z.object({
  DB: z.custom<D1Database>((v) => v != null, 'D1 binding missing'),
  BETTER_AUTH_SECRET: z.string().min(32),
  RESEND_API_KEY: z.string().min(10),
  ORG_TIMEZONE: z
    .string()
    .refine((tz) => Intl.supportedValuesOf('timeZone').includes(tz), 'ORG_TIMEZONE must be an IANA zone'),
  APP_URL: z.url(),
  MAIL_FROM: z.string().min(3),
})
export type Env = z.infer<typeof EnvSchema>

let cached: Env | undefined

// Call only inside request handlers: D1 methods throw outside a request context.
export function getEnv(): Env {
  cached ??= EnvSchema.parse(bindings)
  return cached
}
