import '@/styles/app.css'
import { PostHogProvider } from '@posthog/react'
import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import { getAnalyticsToken } from '@/lib/analytics-config'
import { getSession } from '@/lib/auth-functions'
import { NOT_FOUND_TITLE } from '@/lib/page-title'
import { tagAutomatedBrowser } from '@/lib/posthog-bot-tag'
import { connectPostHogClientErrors } from '@/lib/posthog-client-errors'
import { dropExtensionExceptions } from '@/lib/posthog-exception-filter'
import { POSTHOG_INGEST_HOST, POSTHOG_UI_HOST } from '@/lib/posthog-hosts'
import { identifyPostHogUser } from '@/lib/posthog-identity'
import { BRAND_ICON_PATH, SITE_NAME } from '@/lib/site'
import { rootSocialMeta } from '@/og/meta'
import interfaceFontUrl from '@/styles/fonts/hanken-grotesk-latin-wght-normal.woff2?url'
import { Stack } from '@/ui/layout'
import { PageShell } from '@/ui/shell'
import { Toaster } from '@/ui/sonner'
import { Heading, TextLink } from '@/ui/text'

export const Route = createRootRoute({
  // Load the session and the analytics token together. The token is null everywhere but prod, which
  // is how PostHog stays off in local dev + staging (see analytics-config + the provider below).
  loader: async () => {
    const [user, posthogToken] = await Promise.all([getSession(), getAnalyticsToken()])
    return { user, posthogToken }
  },
  head: ({ match }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      // `_notFound` marks the root as the boundary for a path no route matches.
      { title: match._notFound ? NOT_FOUND_TITLE : SITE_NAME },
      ...rootSocialMeta(),
    ],
    links: [
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      // Google Search shows no SVG favicon; it takes this PNG (square, over 48px).
      { rel: 'icon', href: '/favicon.png', type: 'image/png', sizes: '192x192' },
      { rel: 'apple-touch-icon', href: BRAND_ICON_PATH },
      // The interface font starts downloading with the HTML, so text rarely paints in a fallback
      // and then shifts. Font preloads need crossOrigin even on the same origin.
      {
        rel: 'preload',
        href: interfaceFontUrl,
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      },
    ],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
  notFoundComponent: PageNotFound,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function PageNotFound() {
  return (
    <PageShell user={null}>
      <Stack gap={4}>
        <Heading level={1}>Page not found</Heading>
        <TextLink to="/">Back to gallery</TextLink>
      </Stack>
    </PageShell>
  )
}

function RootComponent() {
  const { posthogToken, user } = Route.useLoaderData()
  const body = (
    <>
      <Outlet />
      <Toaster />
    </>
  )
  return (
    // PostHog only wraps the app when a token is present — i.e. prod. In dev/staging there's no
    // token, so we skip the provider entirely (no events, no warnings).
    <>
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
            // Drop exceptions thrown by visitors' browser extensions, which capture_exceptions
            // reports from the page too. Our own errors still report (see posthog-exception-filter).
            // Then mark events from automated browsers isBot, which reports filter out
            // (see posthog-bot-tag).
            before_send: [dropExtensionExceptions, tagAutomatedBrowser()],
            // We only use product analytics, not session replay.
            disable_session_recording: true,
            debug: import.meta.env.DEV,
            loaded: (posthog) => {
              connectPostHogClientErrors(posthog)
              if (user) identifyPostHogUser(posthog, user)
            },
          }}
        >
          {body}
        </PostHogProvider>
      ) : (
        body
      )}
    </>
  )
}
