import type { PostHog } from 'posthog-js'
import { consumePendingAuthIntent } from '@/lib/sign-in'

const CURRENT_URL_PROPERTY = '$current_url'

export interface AnalyticsUser {
  id: string
  name: string
  username?: string | null | undefined
}

/** Identify a signed-in user and close the OAuth funnel when a pending intent exists. */
export function identifyPostHogUser(
  posthog: Pick<PostHog, 'identify' | 'capture'>,
  user: AnalyticsUser,
): void {
  posthog.identify(user.id, { name: user.username ?? user.name, username: user.username })
  const pendingAuth = consumePendingAuthIntent()
  if (pendingAuth) {
    posthog.capture('auth_completed', {
      provider: 'github',
      entryPoint: pendingAuth.entryPoint,
      returnPath: pendingAuth.returnPath,
      [CURRENT_URL_PROPERTY]: pendingAuth.returnPath,
    })
  }
}
