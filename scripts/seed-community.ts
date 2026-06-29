import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { account, configs, user } from '@/db/schema'
import type { Interpreter } from '@/render/types'
import { submitConfig, validateSubmitInput } from '@/submit/submit'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface GithubUser {
  id: string
  login: string
  name: string
  avatarUrl: string
}

export async function fetchGithubUser(login: string): Promise<GithubUser> {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'statuslines-seed',
  }
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`

  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, { headers })
  if (res.status === 404) throw new Error(`GitHub user not found: ${login}`)
  if (!res.ok) throw new Error(`GitHub API error ${res.status} for ${login}`)

  const body = (await res.json()) as {
    id: number
    login: string
    name: string | null
    // biome-ignore lint/style/useNamingConvention: GitHub API response field.
    avatar_url: string
  }
  return {
    id: String(body.id),
    login: body.login,
    name: body.name ?? body.login,
    avatarUrl: body.avatar_url,
  }
}

/** Returns the user.id to attribute seeded configs to. If a github account row already
 *  exists for this GitHub numeric id (the person already signed in, or was already seeded),
 *  returns that user unchanged — never creates a duplicate. Otherwise creates a placeholder
 *  user + a matching github account row so the person's first real GitHub sign-in adopts it. */
export async function ensureSeededAuthor(db: Db, profile: GithubUser): Promise<string> {
  const [existing] = await db
    .select()
    .from(account)
    .where(and(eq(account.providerId, 'github'), eq(account.accountId, profile.id)))
  if (existing) return existing.userId

  const userId = randomUUID()
  const now = new Date()
  await db.insert(user).values({
    id: userId,
    name: profile.name,
    email: `seed+${profile.login.toLowerCase()}@statuslin.es`,
    emailVerified: false,
    image: profile.avatarUrl,
    username: profile.login,
    role: 'user',
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(account).values({
    id: randomUUID(),
    accountId: profile.id,
    providerId: 'github',
    userId,
    createdAt: now,
    updatedAt: now, // account.updatedAt has no DB default — set it explicitly.
  })
  return userId
}

export interface CommunityConfig {
  githubLogin: string
  /** GitHub numeric id, pinned at review time and verified against the live API at run time.
   *  Guards against a login that was renamed/recycled to a different person since review. */
  githubId: string
  title: string
  description: string
  interpreter: Interpreter
  source: string
}

export type SeedStatus = 'submitted' | 'skipped' | 'error'
export interface SeedOutcome {
  login: string
  title: string
  status: SeedStatus
  slug?: string
  configId?: string
  reason?: string
}

/** Seeds ONE config: ensure the author exists, then submit it through the normal pipeline.
 *  Submit-only by design — no render, no publish here. The always-on worker renders the
 *  queued job and an admin approves it in the review queue, so seeded (untrusted) community
 *  scripts get the same human-review gate as every other submission. */
export async function seedCommunityConfig(
  db: Db,
  profile: GithubUser,
  entry: CommunityConfig,
): Promise<SeedOutcome> {
  const authorId = await ensureSeededAuthor(db, profile)

  // Idempotency: skip if this author already has a config with this title (any status).
  const existing = await db
    .select({ id: configs.id })
    .from(configs)
    .where(sql`${configs.authorId} = ${authorId} AND ${configs.title} = ${entry.title}`)
  if (existing.length > 0) {
    return { login: entry.githubLogin, title: entry.title, status: 'skipped' }
  }

  // Route through the same validation the web submit path uses (length/interpreter/host caps).
  // Note: submitConfig also enforces a 3-submissions-per-author-per-hour rate limit, so keep a
  // single author to a few entries per run (see scripts/seed-data/community-configs.ts).
  const validated = validateSubmitInput({
    title: entry.title,
    description: entry.description,
    interpreter: entry.interpreter,
    source: entry.source,
  })
  const { configId, slug } = await submitConfig(db, { ...validated, authorId })
  return { login: entry.githubLogin, title: entry.title, status: 'submitted', slug, configId }
}

/** Seeds every entry. One bad entry (GitHub 404, rate limit, id mismatch, validation reject)
 *  is recorded as an 'error' outcome and does not abort the rest of the batch. */
export async function seedCommunity(db: Db, entries: CommunityConfig[]): Promise<SeedOutcome[]> {
  const outcomes: SeedOutcome[] = []
  for (const entry of entries) {
    try {
      const profile = await fetchGithubUser(entry.githubLogin)
      if (profile.id !== entry.githubId) {
        throw new Error(
          `GitHub id mismatch for @${entry.githubLogin}: pinned ${entry.githubId}, live ${profile.id} (login may have been renamed or recycled)`,
        )
      }
      outcomes.push(await seedCommunityConfig(db, profile, entry))
    } catch (err) {
      outcomes.push({
        login: entry.githubLogin,
        title: entry.title,
        status: 'error',
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return outcomes
}

// CLI entry: submit every entry in the data file against the env-configured DB.
// Run against STAGING first, then promote the same change to production:
//   fly ssh console --app statuslines-staging --command "bun run scripts/seed-community.ts"
//   fly ssh console --app statuslines          --command "bun run scripts/seed-community.ts"
// Submit-only: the always-on worker renders each queued job, then an admin approves it in the
// review queue. Nothing is auto-published — untrusted community scripts get the normal human
// review gate. (Intentionally does NOT import refuse-in-production: it forges no sessions and
// grants no admin, only normal role:'user' placeholders, and is meant to run in prod.)
if (import.meta.main) {
  const { db } = await import('@/db')
  const { COMMUNITY_CONFIGS } = await import('./seed-data/community-configs')

  if (COMMUNITY_CONFIGS.length === 0) {
    console.log('No community configs to seed (scripts/seed-data/community-configs.ts is empty).')
    process.exit(0)
  }

  const outcomes = await seedCommunity(db, COMMUNITY_CONFIGS)
  for (const o of outcomes) {
    const suffix = o.slug ? ` → /${o.slug}` : o.reason ? ` — ${o.reason}` : ''
    console.log(`[${o.status}] @${o.login} — "${o.title}"${suffix}`)
  }
  const errored = outcomes.filter((o) => o.status === 'error')
  console.log(
    `\nSeed complete: ${outcomes.length} processed, ${errored.length} errored. ` +
      'Submitted configs await render + admin review in the queue.',
  )
  process.exit(errored.length > 0 ? 1 : 0)
}
