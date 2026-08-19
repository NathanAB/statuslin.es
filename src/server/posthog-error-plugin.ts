import { definePlugin } from 'nitro'
// Relative (not @/) imports: a plugin listed in nitro() config is bundled by Nitro, which doesn't
// resolve the app's tsconfig path alias. nitro-error-context has no runtime import of its own.
import { captureServerException } from '../lib/posthog-server'
import { isClientDisconnect } from './client-disconnect'
import { serverErrorContextFromNitro } from './nitro-error-context'

/**
 * Nitro `error` hook → PostHog. The web process's catch-all: SSR render crashes, uncaught
 * exceptions, and unhandled promise rejections all route through this one hook. Just glue — the
 * fail-soft + dedup + token gating all live in captureServerException. Registered via
 * vite.config.ts `nitro({ plugins: [...] })`.
 */
export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, ctx) => {
    // A browser closing the connection mid-request is not a crash — drop it before it reaches error
    // tracking, where it would sit as a fake issue next to real ones.
    if (isClientDisconnect(error)) return
    captureServerException(error, serverErrorContextFromNitro(ctx))
  })
})
