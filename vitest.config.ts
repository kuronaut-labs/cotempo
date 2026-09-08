import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'

const migrations = await readD1Migrations(path.join(import.meta.dirname, 'drizzle/migrations'))

const workers = () =>
  cloudflareTest({
    /* The real entry is a bare specifier the pool cannot resolve; tests only
       need bindings, so a stub Worker stands in. */
    main: './tests/integration/test-worker.ts',
    wrangler: { configPath: './wrangler.jsonc' },
    miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
  })

const setupFiles = ['./tests/integration/apply-migrations.ts']

// `npm test` runs unit + integration. The contract-* projects are the reviewer-owned
// acceptance suite, run with `npm run test:contract`; see CLAUDE.md.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', environment: 'node', include: ['tests/unit/**/*.test.ts'] } },
      { extends: true, plugins: [workers()], test: { name: 'integration', include: ['tests/integration/**/*.test.ts'], setupFiles } },
      { extends: true, test: { name: 'contract-unit', environment: 'node', include: ['tests/contract/unit/**/*.test.ts'] } },
      {
        extends: true,
        plugins: [workers()],
        test: { name: 'contract-integration', include: ['tests/contract/integration/**/*.test.ts'], setupFiles },
      },
    ],
  },
})
