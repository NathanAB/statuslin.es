import { createHash, randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, renderJobs } from '@/db/schema'
import { tryHighlightSource } from '@/lib/highlight'
import { HttpError } from '@/lib/http'
import { INTERPRETERS, type Interpreter } from '@/render/types'
import { detectForeignCredentialAccess, readsClaudeToken } from './credential-access'
import { validateNetworkHosts } from './network-hosts'
import { detectObfuscation } from './obfuscation'
import { slugify } from './slug'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export const SUBMISSION_RATE_LIMIT = 3 // max submissions per author per rate window
const RATE_WINDOW_MS = 60 * 60 * 1000 // 1 hour in milliseconds

// Global cap on pending (queued + running) render_jobs across all authors. The worker drains
// jobs serially, so this bounds backlog and DB growth, not throughput. 100 is generous headroom
// for legitimate bursts while stopping a flood of throwaway accounts from growing the queue
// without bound (H3). Soft cap: the count-then-insert isn't atomic (same as the per-author
// check), so a tiny overshoot under concurrency is acceptable for an abuse backstop.
export const GLOBAL_RENDER_QUEUE_MAX = 100

// Held network jobs sit OUTSIDE GLOBAL_RENDER_QUEUE_MAX (which counts queued+running), so bound
// them separately — a flood of throwaway network submissions shouldn't grow the DB unbounded while
// parked. v1 note: this is a GLOBAL cap, not per-author, so a determined author could park 50
// held jobs and 429 everyone else's network submissions (a feature-DoS, not denial-of-wallet —
// held jobs never render). The per-author 3/hour submission limit blunts it; a per-author held
// cap is a follow-up.
export const HELD_RENDER_JOBS_MAX = 50

export const SUBMIT_LIMITS = { source: 100_000, title: 200, description: 4000 } as const

export function validateSubmitInput(data: {
  interpreter: string
  source: string
  title: string
  description?: string
  networkHosts?: string[]
}): Omit<SubmitInput, 'authorId'> {
  if (!(INTERPRETERS as readonly string[]).includes(data.interpreter))
    throw new HttpError(400, 'invalid interpreter')
  if (!data.source?.trim()) throw new HttpError(400, 'source is required')
  if (!data.title?.trim()) throw new HttpError(400, 'title is required')
  if (data.source.length > SUBMIT_LIMITS.source) throw new HttpError(400, 'source too large')
  if (data.title.length > SUBMIT_LIMITS.title) throw new HttpError(400, 'title too long')
  if ((data.description ?? '').length > SUBMIT_LIMITS.description)
    throw new HttpError(400, 'description too long')
  return {
    title: data.title,
    description: data.description ?? '',
    interpreter: data.interpreter as Interpreter,
    source: data.source,
    networkHosts: validateNetworkHosts(data.networkHosts ?? []),
  }
}

export interface SubmitInput {
  authorId: string
  title: string
  description: string
  interpreter: Interpreter
  source: string
  networkHosts?: string[]
  license?: string | null
  sourceUrl?: string | null
}
export interface SubmitResult {
  configId: string
  versionId: string
  slug: string
}

export async function submitConfig(db: Db, input: SubmitInput): Promise<SubmitResult> {
  const obfuscationReasons = detectObfuscation(input.source)
  if (obfuscationReasons.length > 0) {
    throw new HttpError(
      400,
      `Submission rejected (looks obfuscated): ${obfuscationReasons.join('; ')}`,
    )
  }

  const foreignCredentials = detectForeignCredentialAccess(input.source)
  if (foreignCredentials.length > 0) {
    throw new HttpError(
      400,
      `Submission reads non-Claude credentials: ${foreignCredentials.join('; ')}`,
    )
  }

  const networkHosts = input.networkHosts ?? []

  const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(configs)
    .where(sql`${configs.authorId} = ${input.authorId} AND ${configs.createdAt} > ${windowStart}`)
  const recentCount = countResult[0]?.count ?? 0
  if (recentCount >= SUBMISSION_RATE_LIMIT) {
    throw new HttpError(429, 'Rate limit: too many submissions, try again later')
  }

  // Global backstop: cap pending (queued + running) render work across all authors so a flood
  // of throwaway accounts can't grow the queue without bound and starve legitimate submissions.
  const pendingResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(renderJobs)
    .where(sql`${renderJobs.status} IN ('queued', 'running')`)
  const pendingCount = pendingResult[0]?.count ?? 0
  if (pendingCount >= GLOBAL_RENDER_QUEUE_MAX) {
    throw new HttpError(429, 'Render queue is full, try again shortly')
  }

  if (networkHosts.length > 0) {
    const heldResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(renderJobs)
      .where(sql`${renderJobs.status} = 'held'`)
    if ((heldResult[0]?.count ?? 0) >= HELD_RENDER_JOBS_MAX) {
      throw new HttpError(429, 'Network review queue is full, try again shortly')
    }
  }

  const slug = `${slugify(input.title)}-${randomUUID().slice(0, 8)}`
  const contentSha256 = createHash('sha256').update(input.source).digest('hex')
  const readsToken = readsClaudeToken(input.source)
  // Highlight once now (best-effort) so the detail page reads stored HTML instead of running Shiki
  // on every render. The source is immutable for this version, so the stored HTML never goes stale.
  const sourceHtml = await tryHighlightSource(input.source, input.interpreter)
  return db.transaction(async (tx) => {
    const cfgRows = await tx
      .insert(configs)
      .values({
        slug,
        title: input.title,
        description: input.description,
        authorId: input.authorId,
        interpreter: input.interpreter,
        status: 'draft',
      })
      .returning()
    const cfg = cfgRows[0]
    if (!cfg) throw new Error('insert configs returned no row')
    const verRows = await tx
      .insert(configVersions)
      .values({
        configId: cfg.id,
        versionNumber: 1,
        source: input.source,
        interpreter: input.interpreter,
        contentSha256,
        sourceHtml,
        status: 'pending',
        networkHosts,
        readsClaudeToken: readsToken,
        license: input.license ?? null,
        sourceUrl: input.sourceUrl ?? null,
      })
      .returning()
    const ver = verRows[0]
    if (!ver) throw new Error('insert configVersions returned no row')
    await tx
      .insert(renderJobs)
      .values({ configVersionId: ver.id, status: networkHosts.length > 0 ? 'held' : 'queued' })
    return { configId: cfg.id, versionId: ver.id, slug }
  })
}
