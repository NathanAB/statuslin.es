import { definePlugin } from 'nitro'
import { triggerRenderDrain } from './render-drain'

/**
 * Render whatever is already queued when the web server starts: jobs submitted while no machine was
 * running, and jobs a stopped or crashed machine left 'running' past the time limit. Registered via
 * vite.config.ts `nitro({ plugins: [...] })`. Nitro bundles plugins apart from the app, so this
 * process gets a second copy of the drain; that's safe, since each job is claimed with a
 * conditional update.
 */
export default definePlugin(() => {
  triggerRenderDrain()
})
