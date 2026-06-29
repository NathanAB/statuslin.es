// Guards the seed-first auto-login guarantee: a seeded author (user + github account
// row) must be ADOPTED by that person's first real GitHub sign-in — not duplicated.
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { PGlite } from '@electric-sql/pglite'
import { betterAuth } from 'better-auth'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { user as userTable } from '@/db/schema'
import { ensureSeededAuthor } from '../../scripts/seed-community'

const GH_ID = '583231'
const GH_LOGIN = 'octocat'
const GH_REAL_EMAIL = 'octo@realgithub.example'

function buildTestAuth(database: ReturnType<typeof drizzle>) {
  return betterAuth({
    database: drizzleAdapter(database, { provider: 'pg' }),
    secret: 'test-secret-that-is-long-enough-for-better-auth-validation',
    baseURL: 'http://localhost:3000',
    socialProviders: {
      github: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        mapProfileToUser: (profile: { login: string }) => ({ username: profile.login }),
        overrideUserInfoOnSignIn: true,
      },
    },
    user: {
      additionalFields: {
        role: { type: 'string', defaultValue: 'user', input: false },
        username: { type: 'string', input: false },
      },
    },
  })
}

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
let auth: ReturnType<typeof buildTestAuth>
const realFetch = globalThis.fetch

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  auth = buildTestAuth(db)
})

afterAll(async () => {
  globalThis.fetch = realFetch
  await client.close()
})

afterEach(() => {
  globalThis.fetch = realFetch
})

function stubGithubFetch() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith('https://github.com/login/oauth/access_token')) {
      return new Response(
        JSON.stringify({
          access_token: 'gho_test',
          token_type: 'bearer',
          scope: 'read:user,user:email',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    if (url === 'https://api.github.com/user') {
      return new Response(
        JSON.stringify({
          id: GH_ID,
          login: GH_LOGIN,
          name: 'The Octocat',
          avatar_url: 'https://avatars.githubusercontent.com/u/583231',
          email: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    if (url === 'https://api.github.com/user/emails') {
      return new Response(
        JSON.stringify([
          { email: GH_REAL_EMAIL, primary: true, verified: true, visibility: 'public' },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    return realFetch(input, init)
  }) as unknown as typeof fetch
}

function cookieHeaderFrom(res: Response): string {
  const raw = res.headers.get('set-cookie') ?? ''
  return raw
    .split(/,(?=[^;]+?=)/)
    .map((c) => c.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ')
}

async function driveGithubSignIn(): Promise<Response> {
  stubGithubFetch()
  const start = await auth.api.signInSocial({
    body: { provider: 'github', callbackURL: '/' },
    returnHeaders: true,
  })
  const url = (start.response as { url?: string }).url
  if (!url) throw new Error('no authorize url')
  const state = new URL(url).searchParams.get('state')
  if (!state) throw new Error('no state param')
  const stateCookie = cookieHeaderFrom(
    new Response(null, { headers: { 'set-cookie': start.headers?.get('set-cookie') ?? '' } }),
  )
  return auth.handler(
    new Request(
      `http://localhost:3000/api/auth/callback/github?code=fake_code&state=${encodeURIComponent(state)}`,
      { headers: { cookie: stateCookie } },
    ),
  )
}

describe('seeded author auto-login', () => {
  it('adopts the seeded author on first real GitHub sign-in and self-heals the profile', async () => {
    const seededId = await ensureSeededAuthor(db, {
      id: GH_ID,
      login: GH_LOGIN,
      name: 'The Octocat',
      avatarUrl: 'https://github.com/octocat.png',
    })

    const before = await db.select().from(userTable)
    expect(before.length).toBe(1)

    const callbackRes = await driveGithubSignIn()
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: cookieHeaderFrom(callbackRes) }),
    })

    // Same id → adopted, not duplicated.
    expect(session?.user.id).toBe(seededId)
    const after = await db.select().from(userTable)
    expect(after.length).toBe(1)

    // Placeholder fields self-healed to real GitHub values.
    expect(after[0]?.email).toBe(GH_REAL_EMAIL)
    expect(after[0]?.emailVerified).toBe(true)
    expect(after[0]?.username).toBe(GH_LOGIN)
  })
})
