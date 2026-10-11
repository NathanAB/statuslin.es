import { and, desc, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, renderJobs, submissions } from '@/db/schema'
import { isUniqueViolation } from '@/db/unique-violation'
import { HttpError } from '@/lib/http'
import type { Interpreter } from '@/render/types'
import { insertPendingSubmission, supersedeRejectionEmail } from '@/submissions/record'
import type { SubmitResult } from './submit'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>
type ResubmissionTarget = {
  config: typeof configs.$inferSelect
  version: typeof configVersions.$inferSelect
  submission: typeof submissions.$inferSelect
}

export interface ResubmissionDraft {
  kind: 'resubmission'
  versionId: string
  slug: string
  title: string
  description: string
  interpreter: string
  source: string
  networkHosts: string[]
}

export interface PreparedVersion {
  authorId: string
  title: string
  description: string
  interpreter: Interpreter
  source: string
  networkHosts: string[]
  contentSha256: string
  sourceHtml: string | null
  readsClaudeToken: boolean
  license: string | null
  sourceUrl: string | null
}

function assertResubmissionTarget(
  target: ResubmissionTarget,
  latestVersionId: string | undefined,
  authorId: string,
): void {
  if (target.config.authorId !== authorId) {
    throw new HttpError(403, 'cannot resubmit another author’s submission')
  }
  if (target.config.status !== 'draft' || target.config.currentVersionId !== null) {
    throw new HttpError(409, 'published or removed configs cannot be resubmitted')
  }
  if (target.submission.status !== 'rejected' || latestVersionId !== target.version.id) {
    throw new HttpError(409, 'only the latest rejected version can be resubmitted')
  }
}

export async function getResubmissionDraft(
  database: Db,
  slug: string,
  authorId: string,
): Promise<ResubmissionDraft> {
  const [row] = await database
    .select({ config: configs, version: configVersions, status: submissions.status })
    .from(configs)
    .innerJoin(configVersions, eq(configVersions.configId, configs.id))
    .innerJoin(submissions, eq(submissions.configVersionId, configVersions.id))
    .where(and(eq(configs.slug, slug), eq(configs.authorId, authorId)))
    .orderBy(desc(configVersions.versionNumber))
    .limit(1)
  if (!row) throw new HttpError(404, 'rejected submission not found')
  if (row.config.status !== 'draft' || row.config.currentVersionId !== null) {
    throw new HttpError(409, 'published or removed configs cannot be resubmitted')
  }
  if (row.status !== 'rejected') {
    throw new HttpError(409, 'only the latest rejected version can be resubmitted')
  }
  return {
    kind: 'resubmission',
    versionId: row.version.id,
    slug: row.config.slug,
    title: row.version.title,
    description: row.version.description,
    interpreter: row.version.interpreter,
    source: row.version.source,
    networkHosts: row.version.networkHosts ?? [],
  }
}

export async function createResubmissionVersion(
  database: Db,
  rejectedVersionId: string,
  input: PreparedVersion,
): Promise<SubmitResult> {
  try {
    return await database.transaction(async (tx) => {
      const [target] = await tx
        .select({ config: configs, version: configVersions, submission: submissions })
        .from(configVersions)
        .innerJoin(configs, eq(configs.id, configVersions.configId))
        .innerJoin(submissions, eq(submissions.configVersionId, configVersions.id))
        .where(eq(configVersions.id, rejectedVersionId))
      if (!target) throw new HttpError(409, 'rejected version not found')
      const [latest] = await tx
        .select({ id: configVersions.id })
        .from(configVersions)
        .where(eq(configVersions.configId, target.config.id))
        .orderBy(desc(configVersions.versionNumber))
        .limit(1)
      assertResubmissionTarget(target, latest?.id, input.authorId)
      await supersedeRejectionEmail(tx, target.submission)
      const [version] = await tx
        .insert(configVersions)
        .values({
          configId: target.config.id,
          versionNumber: target.version.versionNumber + 1,
          title: input.title,
          description: input.description,
          source: input.source,
          interpreter: input.interpreter,
          contentSha256: input.contentSha256,
          sourceHtml: input.sourceHtml,
          networkHosts: input.networkHosts,
          readsClaudeToken: input.readsClaudeToken,
          license: input.license,
          sourceUrl: input.sourceUrl,
        })
        .returning()
      if (!version) throw new Error('insert configVersions returned no row')
      await insertPendingSubmission(tx, {
        kind: 'status_line',
        versionId: version.id,
        submittedBy: input.authorId,
      })
      await tx.insert(renderJobs).values({
        configVersionId: version.id,
        status: input.networkHosts.length > 0 ? 'held' : 'queued',
      })
      return {
        configId: target.config.id,
        versionId: version.id,
        slug: target.config.slug,
      }
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, 'submission was already resubmitted')
    }
    throw error
  }
}
