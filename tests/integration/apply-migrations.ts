import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'

// Runs per file outside storage isolation; idempotent.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
