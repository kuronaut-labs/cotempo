import { getEnv } from './env'

const MAIL_TIMEOUT_MS = 10_000

export async function sendMail(msg: { to: string; subject: string; html: string }) {
  const env = getEnv()
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, ...msg }),
    // Abort after 10s so a slow Resend doesn't hold up a request indefinitely.
    // The invite path catches errors; the reset-password path was propagating
    // raw 500s. Both now fail fast with a typed error. (#L6)
    signal: AbortSignal.timeout(MAIL_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`mail ${res.status}: ${await res.text()}`)
}
