import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { PGlite } from '@electric-sql/pglite'
import { betterAuth } from 'better-auth'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/auth-schema'
import { user as userTable } from '@/db/auth-schema'
import { auth as prodAuth } from '@/lib/auth'

// Approach: build a Better Auth instance over an in-memory PGlite database
// (the same engine db.test.ts uses) with email/password enabled. This
// exercises the real Better Auth session pipeline -- sign-up, sign-in, and
// session resolution -- WITHOUT the GitHub OAuth round-trip and WITHOUT a
// live Postgres server.
//
// Why not better-auth/test getTestInstance(): its default backend is
// node:sqlite, which is not available under this Bun version
// ("No such built-in module: node:sqlite"), and its only other backends
// (postgres/mysql/mongodb) require live external databases. PGlite gives us
// a genuine, self-contained Postgres-compatible store instead.
//
// This auth instance is test-only and never imported by production code.
// (The production auth is imported separately below to assert config shape.)

function buildTestAuth(db: ReturnType<typeof drizzle>) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg' }),
    secret: 'test-secret-that-is-long-enough-for-better-auth-validation',
    baseURL: 'http://localhost:3000',
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: {
        role: { type: 'string', defaultValue: 'user', input: false },
      },
    },
  })
}

let client: PGlite
let auth: ReturnType<typeof buildTestAuth>
let pgliteDb: ReturnType<typeof drizzle>

beforeAll(async () => {
  client = new PGlite()
  pgliteDb = drizzle({ client, schema })
  await migrate(pgliteDb, { migrationsFolder: './drizzle' })
  auth = buildTestAuth(pgliteDb)
})

afterAll(async () => {
  await client.close()
})

describe('Better Auth session logic', () => {
  it('resolves a session whose user id matches the signed-in user', async () => {
    const email = 'ada@example.com'
    const password = 'correct-horse-battery-staple'

    // Sign up + sign in a test user (no GitHub OAuth involved).
    const signUp = await auth.api.signUpEmail({
      body: { email, password, name: 'Ada Lovelace' },
      returnHeaders: true,
    })
    const userId = signUp.response.user.id
    expect(userId).toBeTruthy()

    // Drive sign-in through the real HTTP handler to obtain a session cookie,
    // proving the full credential -> session-token path works.
    const signInRes = await auth.handler(
      new Request('http://localhost:3000/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
    )
    expect(signInRes.status).toBe(200)

    const setCookie = signInRes.headers.get('set-cookie')
    expect(setCookie).toBeTruthy()

    // Resolve the session for that cookie and assert the user id matches.
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: setCookie as string }),
    })
    expect(session).not.toBeNull()
    expect(session?.user.id).toBe(userId)
  })

  it('returns null session when no credentials are presented', async () => {
    const session = await auth.api.getSession({ headers: new Headers() })
    expect(session).toBeNull()
  })

  // Regression for the admin-role bug: getSession must report the user row's
  // CURRENT role, not a value cached at session-creation time. A user promoted
  // to 'admin' after their session was minted must read as admin on the next
  // session resolution -- otherwise the admin "Review" UI and queue stay hidden.
  it('reflects a role promotion in an already-existing session', async () => {
    const email = 'grace@example.com'
    const password = 'correct-horse-battery-staple'

    const signUp = await auth.api.signUpEmail({
      body: { email, password, name: 'Grace Hopper' },
      returnHeaders: true,
    })
    const userId = signUp.response.user.id

    const signInRes = await auth.handler(
      new Request('http://localhost:3000/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
    )
    const setCookie = signInRes.headers.get('set-cookie') as string

    // Default role at sign-up.
    const before = await auth.api.getSession({
      headers: new Headers({ cookie: setCookie }),
    })
    expect((before?.user as { role?: string }).role).toBe('user')

    // Promote directly in the DB (as a maintainer would), session unchanged.
    await pgliteDb.update(userTable).set({ role: 'admin' }).where(eq(userTable.id, userId))

    // Same cookie / same session row -> must now resolve as admin.
    const after = await auth.api.getSession({
      headers: new Headers({ cookie: setCookie }),
    })
    expect((after?.user as { role?: string }).role).toBe('admin')
  })
})

// A GitHub re-sign-in with overrideUserInfoOnSignIn:true overwrites the user row
// with EXACTLY the fields mapProfileToUser returns (plus name/email/image/
// emailVerified). 'role' is intentionally absent from that map, so an admin
// keeps admin across re-logins. If a future edit adds 'role' to mapProfileToUser,
// every re-login would reset the user back to the default role -- this guard
// fails loudly before that ships. See src/lib/auth.ts.
describe('GitHub provider config (production auth)', () => {
  it('mapProfileToUser never returns a role field', async () => {
    const github = (
      prodAuth.options as unknown as {
        socialProviders?: {
          github?: {
            mapProfileToUser?: (p: {
              login: string
            }) => Record<string, unknown> | Promise<Record<string, unknown>>
            overrideUserInfoOnSignIn?: boolean
          }
        }
      }
    ).socialProviders?.github

    expect(github?.mapProfileToUser).toBeTypeOf('function')
    const mapped = await github?.mapProfileToUser?.({ login: 'octocat' })
    expect(mapped).not.toHaveProperty('role')
  })
})
