import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { PGlite } from '@electric-sql/pglite'
import { betterAuth } from 'better-auth'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/auth-schema'
import { toHeaderUser } from '@/lib/auth-functions'

function buildTestAuth(db: ReturnType<typeof drizzle>) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg' }),
    secret: 'test-secret-that-is-long-enough-for-better-auth-validation',
    baseURL: 'http://localhost:3000',
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: {
        role: { type: 'string', defaultValue: 'user', input: false },
        username: { type: 'string', input: false },
      },
    },
  })
}

let client: PGlite
let auth: ReturnType<typeof buildTestAuth>

// A genuine Better Auth session resolved from a real signed-in cookie.
type ResolvedSession = Awaited<ReturnType<typeof auth.api.getSession>>

let realSession: ResolvedSession

beforeAll(async () => {
  client = new PGlite()
  const db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  auth = buildTestAuth(db)

  const email = 'leak@example.com'
  const password = 'correct-horse-battery-staple'
  await auth.api.signUpEmail({
    body: { email, password, name: 'Leak Tester' },
    returnHeaders: true,
  })
  const signInRes = await auth.handler(
    new Request('http://localhost:3000/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  )
  const setCookie = signInRes.headers.get('set-cookie') as string
  realSession = await auth.api.getSession({ headers: new Headers({ cookie: setCookie }) })
})

afterAll(async () => {
  await client.close()
})

const SENSITIVE_KEYS = ['token', 'email', 'emailVerified', 'ipAddress', 'userAgent'] as const

describe('toHeaderUser projection', () => {
  it('the real Better Auth session actually carries the sensitive fields (guards the test itself)', () => {
    // If this ever fails, the negative assertions below would be vacuous.
    expect(realSession).not.toBeNull()
    expect(realSession?.user.email).toBe('leak@example.com')
    expect(typeof realSession?.session.token).toBe('string')
    expect(realSession?.session.token.length).toBeGreaterThan(0)
  })

  it('returns only the narrow header-user fields', () => {
    const headerUser = toHeaderUser(realSession)
    expect(headerUser).not.toBeNull()
    expect(Object.keys(headerUser as object).sort()).toEqual(
      ['id', 'image', 'name', 'role', 'username'].sort(),
    )
    expect(headerUser?.name).toBe('Leak Tester')
    expect(headerUser?.role).toBe('user')
    // The stable user id is included (used as the PostHog distinct id) and matches the real row.
    expect(headerUser?.id).toBe(realSession?.user.id)
  })

  it('contains none of the sensitive session/user fields anywhere in the serialized payload', () => {
    const headerUser = toHeaderUser(realSession)
    // Walk the whole JSON-serialized projection (what TanStack ships to the client)
    // and assert no sensitive key and no sensitive value survives.
    const serialized = JSON.stringify(headerUser)
    for (const key of SENSITIVE_KEYS) {
      expect(serialized).not.toContain(`"${key}"`)
    }
    expect(serialized).not.toContain('leak@example.com')
    expect(serialized).not.toContain(realSession?.session.token as string)
  })

  it('returns null for a null session (signed-out)', () => {
    expect(toHeaderUser(null)).toBeNull()
  })
})
