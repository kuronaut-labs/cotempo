import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'

// `cloudflare:workers` is a Workers-only import (per @cloudflare/vite-plugin).
// The TanStack Start client build still traces it through server fns, so stub
// it for every non-SSR env to keep the client bundle compiling. The SSR env
// must resolve to the real module so the cloudflare plugin injects bindings.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    {
      name: 'cloudflare-workers-stub-client',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'cloudflare:workers' && this.environment?.name !== 'ssr') {
          return '\0cf-stub'
        }
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
