import { definePlugin } from 'nitro'
// Relative (not @/) imports: a plugin listed in nitro() config is bundled by Nitro, which doesn't
// resolve the app's tsconfig path alias. Neither module has a runtime import of its own.
import { assertProductionDbTls } from '../db/assert-tls'
import { requireEnv } from '../lib/env'

/**
 * Fail fast at web-server startup on a plaintext production DATABASE_URL. The SSR bundle imports
 * `@/db` lazily, so the module-scope guard in src/db/index.ts would otherwise throw once per request
 * — a server that reports itself healthy while returning 500s. Running the check in this Nitro
 * startup plugin crashes the process before it serves any request. No-op outside production (see
 * assert-tls.ts). Registered via vite.config.ts `nitro({ plugins: [...] })`.
 */
export default definePlugin(() => {
  assertProductionDbTls(requireEnv('DATABASE_URL'), process.env.NODE_ENV)
})
