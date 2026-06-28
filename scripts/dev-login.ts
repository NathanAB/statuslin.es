import '@/lib/refuse-in-production'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { db } from '@/db'
import { session as sessionTable, user as userTable } from '@/db/auth-schema'
import { requireStrongSecret } from '@/lib/env'

/**
 * Dev-only: mint a Better Auth session for a user and print the signed session cookie + a
 * ready-to-run agent-browser command, so an automated browser can test signed-in UX without
 * going through GitHub OAuth.
 *
 *   bun run dev:login                 # first admin, else first user
 *   bun run dev:login "Ada"           # by name
 *   bun run dev:login me@example.com  # by email
 *
 * How the cookie is built (must match better-call's `signCookieValue`, see
 * node_modules/better-call/dist/crypto.mjs): value = `${token}.${base64(HMAC-SHA256(secret, token))}`.
 * Standard base64 (NOT base64url). The cookie name is `better-auth.session_token`.
 *
 * NOTE: the session row goes in whatever DB `DATABASE_URL` points at — make sure migrations are
 * applied there (`bun run db:migrate`), or signed-in pages that read new tables (e.g. votes) 500.
 *
 * See docs/testing-signed-in.md.
 */
const query = process.argv[2]

const users = await db.select().from(userTable)
const target = query
  ? users.find((u) => u.name === query || u.email === query)
  : (users.find((u) => u.role === 'admin') ?? users[0])

if (!target) {
  console.error(query ? `No user matching "${query}".` : 'No users in the DB — sign in once first.')
  process.exit(1)
}

const token = randomBytes(32).toString('base64url')
const now = new Date()
const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

await db.insert(sessionTable).values({
  id: randomUUID(),
  token,
  userId: target.id,
  expiresAt,
  createdAt: now,
  updatedAt: now,
})

const sig = createHmac('sha256', requireStrongSecret('BETTER_AUTH_SECRET'))
  .update(token)
  .digest('base64')
const cookie = `${token}.${sig}`
const url = process.env.BETTER_AUTH_URL ?? 'http://localhost:3100'

console.log(`Signed in as ${target.name} <${target.email}> (role: ${target.role ?? 'user'})`)
console.log(`\nbetter-auth.session_token=${cookie}\n`)
console.log('Set it in the automated browser:')
console.log(
  `  agent-browser cookies set better-auth.session_token '${cookie}' --url ${url} --httpOnly`,
)
process.exit(0)
