import { createServerFn } from '@tanstack/react-start'
import { withHttpStatus } from '@/lib/http.server'

/**
 * The PostHog project token, read from the server's runtime env and handed to the page so analytics
 * turns on ONLY where the token is set — production. It's unset in local dev and staging, so this
 * returns null there and the client never initializes PostHog. Read at RUNTIME (not via
 * `import.meta.env`) on purpose: staging and prod run the same promoted image, so a build-time value
 * couldn't tell them apart. The project token is a public, write-only key, so sending it to the
 * page is expected and safe.
 */
export const getAnalyticsToken = createServerFn({ method: 'GET' }).handler(() =>
  // Can't actually throw (just reads an env var), but wrapped for consistency so every server fn
  // routes unexpected throws through the same capture path.
  withHttpStatus(async () => process.env.POSTHOG_PROJECT_TOKEN ?? null),
)
