// PostHog's fixed US-region endpoints — the same across every environment (safe to hardcode, like a
// vendor's API base URL). Single source for both the reverse proxy (vite.config.ts) and the client
// SDK config (src/routes/__root.tsx) so the two can't drift.
export const POSTHOG_INGEST_HOST = 'https://us.i.posthog.com'
export const POSTHOG_ASSETS_HOST = 'https://us-assets.i.posthog.com'
// Dashboard origin for the toolbar / session-recording links (NOT the ingest host).
export const POSTHOG_UI_HOST = 'https://us.posthog.com'
