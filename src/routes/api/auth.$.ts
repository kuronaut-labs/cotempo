import { createFileRoute } from '@tanstack/react-router'
import { getAuth } from '~/server/auth'

export const Route = createFileRoute('/api/auth/$')({
  server: { handlers: { ANY: ({ request }) => getAuth().handler(request) } },
})
