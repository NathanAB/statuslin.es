import { createHash, randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, renderJobs } from '@/db/schema'
import { tryHighlightSource } from '@/lib/highlight'
import { HttpError } from '@/lib/http'
import { INTERPRETERS, type Interpreter } from '@/render/types'
import { assertUnderRateLimit, insertPendingSubmission } from '@/submissions/record'
import { detectForeignCredentialAccess, readsClaudeToken } from './credential-access'
import { validateNetworkHosts } from './network-hosts'
import { detectObfuscation } from './obfuscation'
import { createResubmissionVersion, type PreparedVersion, type ResubmissionDraft } from './resubmit'
import { slugify } from './slug'
import { createUpdateVersion, findChangedUpdateBase, type UpdateDraft } from './update'

export { getResubmissionDraft, type ResubmissionDraft } from './resubmit'
export { getUpdateDraft, type UpdateDraft } from './update'
export type SubmitDraft = ResubmissionDraft | UpdateDraft

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

// Global cap on pending (queued + running) render_jobs across all authors. Each web machine drains
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

function overLimit(field: string, limit: number): HttpError {
  return new HttpError(400, `${field} is over ${limit.toLocaleString('en-US')} characters`)
}

export function validateSubmitInput(data: {
  interpreter: string
  source: string
  title: string
  description?: string
  networkHosts?: string[]
}): Omit<SubmitInput, 'authorId'> {
  if (!(INTERPRETERS as readonly string[]).includes(data.interpreter))
    throw new HttpError(400, 'Interpreter must be bash, node or python')
  if (!data.source?.trim()) throw new HttpError(400, 'Source code is required')
  if (!data.title?.trim()) throw new HttpError(400, 'Title is required')
  if (data.source.length > SUBMIT_LIMITS.source)
    throw overLimit('Source code', SUBMIT_LIMITS.source)
  if (data.title.length > SUBMIT_LIMITS.title) throw overLimit('Title', SUBMIT_LIMITS.title)
  if ((data.description ?? '').length > SUBMIT_LIMITS.description)
    throw overLimit('Description', SUBMIT_LIMITS.description)
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
/** Where a submission lands: a new config, a resubmission, or an update (never both). */
export type SubmitOptions =
  | { rejectedVersionId?: undefined; updateSlug?: undefined }
  | { rejectedVersionId: string; updateSlug?: undefined }
  | { updateSlug: string; rejectedVersionId?: undefined }
export interface SubmitResult {
  configId: string
  versionId: string
  slug: string
}

export async function submitConfig(
  db: Db,
  input: SubmitInput,
  options: SubmitOptions = {},
): Promise<SubmitResult> {
  const obfuscationReasons = detectObfuscation(input.source)
  if (obfuscationReasons.length > 0) {
    throw new HttpError(400, `Rejected as obfuscated: ${obfuscationReasons.join('; ')}`)
  }

  const foreignCredentials = detectForeignCredentialAccess(input.source)
  if (foreignCredentials.length > 0) {
    throw new HttpError(
      400,
      `Submission reads non-Claude credentials: ${foreignCredentials.join('; ')}`,
    )
  }

  const networkHosts = input.networkHosts ?? []

  await assertUnderRateLimit(db, input.authorId)

  // Global backstop: cap pending (queued + running) render work across all authors so a flood
  // of throwaway accounts can't grow the queue without bound and starve legitimate submissions.
  const pendingResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(renderJobs)
    .where(sql`${renderJobs.status} IN ('queued', 'running')`)
  const pendingCount = pendingResult[0]?.count ?? 0
  if (pendingCount >= GLOBAL_RENDER_QUEUE_MAX) {
    throw new HttpError(429, 'Render queue is full. Try again shortly.')
  }

  if (networkHosts.length > 0) {
    const heldResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(renderJobs)
      .where(sql`${renderJobs.status} = 'held'`)
    if ((heldResult[0]?.count ?? 0) >= HELD_RENDER_JOBS_MAX) {
      throw new HttpError(429, 'Network review queue is full. Try again shortly.')
    }
  }

  const slug = `${slugify(input.title)}-${randomUUID().slice(0, 8)}`
  const contentSha256 = createHash('sha256').update(input.source).digest('hex')
  const readsToken = readsClaudeToken(input.source)
  const updateBase = await findChangedUpdateBase(db, options.updateSlug, input.authorId, {
    ...input,
    networkHosts,
  })
  // Highlight once now (best-effort) so the detail page reads stored HTML instead of running Shiki
  // on every render. The source is immutable for this version, so the stored HTML never goes stale.
  const sourceHtml = await tryHighlightSource(input.source, input.interpreter)
  const prepared: PreparedVersion = {
    ...input,
    networkHosts,
    contentSha256,
    sourceHtml,
    readsClaudeToken: readsToken,
    license: input.license ?? null,
    sourceUrl: input.sourceUrl ?? null,
  }
  if (updateBase) return createUpdateVersion(db, updateBase, prepared)
  if (options.rejectedVersionId) {
    return createResubmissionVersion(db, options.rejectedVersionId, prepared)
  }
  return db.transaction(async (tx) => {
    const cfgRows = await tx
      .insert(configs)
      .values({
        slug,
        authorId: input.authorId,
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
        title: input.title,
        description: input.description,
        source: input.source,
        interpreter: input.interpreter,
        contentSha256,
        sourceHtml,
        networkHosts,
        readsClaudeToken: readsToken,
        license: input.license ?? null,
        sourceUrl: input.sourceUrl ?? null,
      })
      .returning()
    const ver = verRows[0]
    if (!ver) throw new Error('insert configVersions returned no row')
    await insertPendingSubmission(tx, {
      kind: 'status_line',
      versionId: ver.id,
      submittedBy: input.authorId,
    })
    await tx
      .insert(renderJobs)
      .values({ configVersionId: ver.id, status: networkHosts.length > 0 ? 'held' : 'queued' })
    return { configId: cfg.id, versionId: ver.id, slug }
  })
}
