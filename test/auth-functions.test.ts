import { describe, expect, it } from 'vitest'
import { toHeaderUser } from '@/lib/auth-functions'

// The shape Better Auth's getSession resolves to: the full user row plus the session, which carry
// the email, token, ipAddress and userAgent that must never reach the client.
const session = {
  user: {
    id: 'user-1',
    name: 'Leak Tester',
    email: 'leak@example.com',
    emailVerified: true,
    image: null,
    username: 'leaktester',
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  session: {
    id: 'session-1',
    token: 'secret-session-token',
    userId: 'user-1',
    ipAddress: '203.0.113.7',
    userAgent: 'test-agent',
    expiresAt: new Date(),
  },
}

describe('toHeaderUser projection', () => {
  it('returns only the narrow header-user fields', () => {
    const headerUser = toHeaderUser(session)
    expect(headerUser).toEqual({
      id: 'user-1',
      name: 'Leak Tester',
      username: 'leaktester',
      image: null,
      role: 'user',
    })
  })

  it('returns null for a null session (signed-out)', () => {
    expect(toHeaderUser(null)).toBeNull()
  })
})
