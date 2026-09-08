import { createFileRoute } from '@tanstack/react-router'

// Placeholder so `/` can redirect here from Phase 0. Replaced in Task 4.4.
export const Route = createFileRoute('/_app/today')({
  component: () => <main>Today (Phase 4)</main>,
})
