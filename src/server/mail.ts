import { getEnv } from './env'

export async function sendMail(msg: { to: string; subject: string; html: string }) {
  const env = getEnv()
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, ...msg }),
  })
  if (!res.ok) throw new Error(`mail ${res.status}: ${await res.text()}`)
}
