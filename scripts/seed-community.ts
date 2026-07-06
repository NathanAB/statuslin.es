import { randomUUID } from 'node:crypto'
import { and, eq, ne, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { account, configs, configVersions, renderJobs, user } from '@/db/schema'
import type { Interpreter } from '@/render/types'
import { approveVersion, runNetworkPreview } from '@/review/decide'
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
  /** Hosts this script needs network egress to (routed through the same validation + held-job
   *  gate as a normal web submission — see validateSubmitInput/submitConfig). */
  networkHosts?: string[]
  /** SPDX license of the third-party source being seeded, e.g. 'MIT'. */
  license: string
  /** Upstream URL the source was seeded from (dotfiles repo, gist, etc.). */
  sourceUrl: string
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
    ...(entry.networkHosts ? { networkHosts: entry.networkHosts } : {}),
  })
  // license/sourceUrl aren't submit-form fields (validateSubmitInput doesn't validate them) —
  // pass them straight through to submitConfig, which stores them on the version.
  const { configId, slug } = await submitConfig(db, {
    ...validated,
    authorId,
    license: entry.license,
    sourceUrl: entry.sourceUrl,
  })
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

/** Site owner to attribute admin actions (release/publish) to on staging/prod runs: the first
 *  admin, else the first user. Mirrors scripts/seed-gallery.ts's seedAuthorId(). */
async function resolveAdminId(db: Db): Promise<string> {
  const users = await db.select().from(user)
  const admin = users.find((u) => u.role === 'admin') ?? users[0]
  if (!admin) throw new Error('No user to act as reviewer — sign in once first.')
  return admin.id
}

/** Promotes every 'held' render job (parked by seedCommunityConfig for a network-using seed) to
 *  'queued' so the always-on worker renders it — the same explicit admin action as the review
 *  queue's "run network preview" button, just batched across every seeded held job. */
export async function releaseHeldSeeds(db: Db): Promise<number> {
  const held = await db
    .select({ configVersionId: renderJobs.configVersionId })
    .from(renderJobs)
    .where(eq(renderJobs.status, 'held'))
  for (const job of held) {
    await runNetworkPreview(db, job.configVersionId)
  }
  return held.length
}

/** Approves (and thereby publishes) every seeded version whose render job finished successfully
 *  and whose config isn't published yet — the batched equivalent of clicking "approve" in the
 *  review queue for each seeded submission. Versions whose render isn't done are left alone and
 *  counted as skipped so a re-run of `publish-rendered` picks them up once the worker catches up. */
export async function publishRenderedSeeds(
  db: Db,
): Promise<{ published: number; skipped: number }> {
  const adminId = await resolveAdminId(db)
  const rows = await db
    .select({ versionId: configVersions.id, jobStatus: renderJobs.status })
    .from(configVersions)
    .innerJoin(configs, eq(configVersions.configId, configs.id))
    .innerJoin(renderJobs, eq(renderJobs.configVersionId, configVersions.id))
    .where(and(eq(configVersions.status, 'pending'), ne(configs.status, 'published')))

  let published = 0
  let skipped = 0
  for (const row of rows) {
    if (row.jobStatus === 'done') {
      await approveVersion(db, row.versionId, adminId)
      published++
    } else {
      skipped++
    }
  }
  return { published, skipped }
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
