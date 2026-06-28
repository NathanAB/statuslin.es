import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '@/lib/auth'
import { HttpError } from '@/lib/http'

/**
 * Asserts the current request is from an admin user.
 * Pass `getRequestHeaders()` from within a server fn handler.
 * Throws 401 if unauthenticated, 403 if signed in but not an admin. Wrap the calling handler in
 * `withHttpStatus` so the status reaches the response.
 */
export interface AdminUser {
  id: string
  name: string
  email: string
  username: string | null
  image: string | null
  role: string | null
}

export async function assertAdmin(headers: Headers): Promise<AdminUser> {
  const session = await auth.api.getSession({ headers })
  if (!session?.user) throw new HttpError(401, 'sign in required')
  const u = session.user as {
    id: string
    name: string
    email: string
    username?: string | null
    image?: string | null
    role?: string | null
  }
  if (u.role !== 'admin') throw new HttpError(403, 'admin only')
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    username: u.username ?? null,
    image: u.image ?? null,
    role: u.role ?? null,
  }
}

/**
 * Server fn wrapper — call from route loaders/actions when you need the admin
 * check in a client-callable context.
 */
export { getRequestHeaders }
