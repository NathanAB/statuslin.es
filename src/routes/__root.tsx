import '@/styles/app.css'
import { PostHogProvider } from '@posthog/react'
import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import { getAnalyticsToken } from '@/lib/analytics-config'
import { getSession } from '@/lib/auth-functions'
import { POSTHOG_INGEST_HOST, POSTHOG_UI_HOST } from '@/lib/posthog-hosts'
import { identifyPostHogUser } from '@/lib/posthog-identity'
import { rootSocialMeta } from '@/og/meta'
import { Toaster } from '@/ui/sonner'

export const Route = createRootRoute({
  // Load the session and the analytics token together. The token is null everywhere but prod, which
  // is how PostHog stays off in local dev + staging (see analytics-config + the provider below).
  loader: async () => {
    const [user, posthogToken] = await Promise.all([getSession(), getAnalyticsToken()])
    return { user, posthogToken }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'statuslin.es' },
      ...rootSocialMeta(),
    ],
    links: [
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  const { posthogToken, user } = Route.useLoaderData()
  const body = (
    <>
      <Outlet />
      <Toaster />
    </>
  )
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {/* PostHog only wraps the app when a token is present — i.e. prod. In dev/staging there's no
            token, so we skip the provider entirely (no events, no warnings). usePostHog still returns
            a safe no-op instance to any child that calls it. */}
        {posthogToken ? (
          <PostHogProvider
            apiKey={posthogToken}
            options={{
              // Prod posts to '/ingest', reverse-proxied to PostHog by the Nitro route rules
              // (first-party origin → ad-blocker resilience). Dev posts DIRECTLY to PostHog: the
              // Vite dev proxy can't forward the event POST under Bun (it 500s). Only relevant if
              // you set a token locally to test — prod always uses '/ingest'.
              api_host: import.meta.env.DEV ? POSTHOG_INGEST_HOST : '/ingest',
              ui_host: POSTHOG_UI_HOST,
              defaults: '2025-05-24',
              capture_exceptions: true,
              // We only use product analytics, not session replay.
              disable_session_recording: true,
              debug: import.meta.env.DEV,
              loaded: (posthog) => {
                if (user) identifyPostHogUser(posthog, user)
              },
            }}
          >
            {body}
          </PostHogProvider>
        ) : (
          body
        )}
        <Scripts />
      </body>
    </html>
  )
}
