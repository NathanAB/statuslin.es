import type { PostHog } from 'posthog-js'
import { authClient } from '@/lib/auth-client'
import { safeNextPath } from '@/lib/next-path'

export type AuthEntryPoint = 'header' | 'upvote' | 'submit' | 'account' | 'admin'
export const PENDING_AUTH_KEY = 'statuslines.pending-auth'
const CURRENT_URL_PROPERTY = '$current_url'

const AUTH_ENTRY_POINTS = new Set<AuthEntryPoint>([
  'header',
  'upvote',
  'submit',
  'account',
  'admin',
])

export interface PendingAuthIntent {
  entryPoint: AuthEntryPoint
  returnPath: string
}

function analyticsPath(path: string): string {
  return path.split(/[?#]/, 1)[0] || '/'
}

/**
 * Starts the one-click GitHub OAuth redirect, returning the user to `next` (sanitized
 * against open redirects) once they come back. Every sign-in entry point goes through
 * here so the flow lives in exactly one place.
 */
export function startGitHubSignIn(
  next?: string,
  entryPoint: AuthEntryPoint = 'header',
  posthog?: Pick<PostHog, 'capture'>,
): void {
  const returnPath = safeNextPath(next)
  const trackedReturnPath = analyticsPath(returnPath)
  try {
    window.sessionStorage.setItem(
      PENDING_AUTH_KEY,
      JSON.stringify({ entryPoint, returnPath: trackedReturnPath } satisfies PendingAuthIntent),
    )
  } catch {
    // Storage can be unavailable in privacy-restricted browsers; OAuth still works without it.
  }
  posthog?.capture('auth_started', {
    provider: 'github',
    entryPoint,
    returnPath: trackedReturnPath,
    [CURRENT_URL_PROPERTY]: trackedReturnPath,
  })
  void authClient.signIn.social({ provider: 'github', callbackURL: returnPath })
}

/** Consume the short-lived OAuth intent after the callback returns to the app. */
export function consumePendingAuthIntent(): PendingAuthIntent | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_AUTH_KEY)
    window.sessionStorage.removeItem(PENDING_AUTH_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const intent = parsed as { entryPoint?: unknown; returnPath?: unknown }
    if (
      typeof intent.entryPoint !== 'string' ||
      !AUTH_ENTRY_POINTS.has(intent.entryPoint as AuthEntryPoint) ||
      typeof intent.returnPath !== 'string'
    ) {
      return null
    }
    return { entryPoint: intent.entryPoint as AuthEntryPoint, returnPath: intent.returnPath }
  } catch {
    return null
  }
}
