import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '@/lib/auth'
import { withHttpStatus } from '@/lib/http.server'

/**
 * The narrow, client-safe view of the signed-in user — exactly what the page header
 * and author byline need, and nothing more. Structurally assignable to `AppHeaderUser`
 * (src/ui/app-header) and `DashboardUser` (src/review/queue), so callers can pass it
 * straight through without importing those names (keeps the lib→ui boundary clean).
 */
export interface HeaderUser {
  /** Stable user id — used as the PostHog distinct id so client and server events correlate.
   *  Not sensitive (it's the row PK, not a token/email), so it's safe in the SSR payload. */
  id: string
  name: string
  username: string | null
  image: string | null
  role: string | null
}

// Better Auth's getSession resolves to `{ session, user } | null`, where `user` is
// the FULL user row (incl. email/emailVerified) and `session` carries token/ipAddress/
// userAgent. Typed structurally here so the projection doesn't depend on Better Auth's
// internal types — we only read the four safe user fields.
type SessionWithUser = {
  user: {
    id: string
    name: string
    username?: string | null | undefined
    image?: string | null | undefined
    role?: string | null | undefined
  }
} | null

/**
 * Project a resolved Better Auth session down to the client-safe HeaderUser.
 *
 * The full session/user object contains the live
 * session token, the user's email, emailVerified, ipAddress, and userAgent. Returning
 * the whole thing from a server fn dehydrates it into the SSR HTML and the client
 * router cache. This projection is the single choke point that strips all of it, so no
 * route loader can leak it. Tested in test/auth-functions.test.ts.
 */
export function toHeaderUser(session: SessionWithUser): HeaderUser | null {
  if (!session?.user) return null
  return {
    id: session.user.id,
    name: session.user.name,
    username: session.user.username ?? null,
    image: session.user.image ?? null,
    role: session.user.role ?? null,
  }
}

/**
 * Returns the client-safe HeaderUser for the current request, or null when signed out.
 * Never returns the raw session/user (see toHeaderUser).
 */
export const getSession = createServerFn({ method: 'GET' }).handler(() =>
  withHttpStatus(async () => {
    const headers = getRequestHeaders()
    const session = await auth.api.getSession({ headers })
    return toHeaderUser(session)
  }),
)
