import { authClient } from '@/lib/auth-client'
import { safeNextPath } from '@/lib/next-path'

/**
 * Starts the one-click GitHub OAuth redirect, returning the user to `next` (sanitized
 * against open redirects) once they come back. Every sign-in entry point goes through
 * here so the flow lives in exactly one place.
 */
export function startGitHubSignIn(next?: string): void {
  void authClient.signIn.social({ provider: 'github', callbackURL: safeNextPath(next) })
}
