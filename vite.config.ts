import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'

// `cloudflare:workers` is a Workers-only import (per @cloudflare/vite-plugin).
// The TanStack Start client build still traces it through server fns; alias
// to an empty stub so the client bundle compiles. The SSR build uses the
// real module via the cloudflare plugin's normalisation.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: [{ find: 'cloudflare:workers', replacement: '\0cf-stub' }],
  },
  plugins: [
    {
      name: 'cloudflare-workers-stub-client',
      enforce: 'pre',
      resolveId(id) {
        if (id === '\0cf-stub') return '\0cf-stub'
        return null
      },
      load(id) {
        if (id === '\0cf-stub') return 'export const env = undefined; export class WorkerEntrypoint {}; export class DurableObject {}; export class WorkflowEntrypoint {}'
        return null
      },
    },
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    react(),
  ],
})
