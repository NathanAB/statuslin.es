import { and, desc, eq, inArray } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, renderJobs } from '@/db/schema'
import { HttpError } from '@/lib/http'
import type { Interpreter } from '@/render/types'
import type { SubmitResult } from './submit'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>
type ResubmissionTarget = {
  config: typeof configs.$inferSelect
  version: typeof configVersions.$inferSelect
}
const SUPERSEDABLE_REJECTION_EMAIL_STATUSES = [
  'pending',
  'failed',
  'unavailable',
  'ambiguous',
] as const

export interface ResubmissionDraft {
  versionId: string
  slug: string
  title: string
  description: string
  interpreter: string
  source: string
  networkHosts: string[]
}

export interface PreparedResubmission {
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
  if (target.version.status !== 'rejected' || latestVersionId !== target.version.id) {
    throw new HttpError(409, 'only the latest rejected version can be resubmitted')
  }
}

async function supersedeRejectionDelivery(
  database: Pick<Db, 'update'>,
  version: typeof configVersions.$inferSelect,
): Promise<void> {
  if (version.rejectionEmailStatus === 'sending') {
    throw new HttpError(409, 'wait for rejection email delivery to finish before resubmitting')
  }
  if (
    !SUPERSEDABLE_REJECTION_EMAIL_STATUSES.some((status) => status === version.rejectionEmailStatus)
  ) {
    return
  }
  const [superseded] = await database
    .update(configVersions)
    .set({ rejectionEmailStatus: 'superseded', rejectionEmailError: null })
    .where(
      and(
        eq(configVersions.id, version.id),
        inArray(configVersions.rejectionEmailStatus, SUPERSEDABLE_REJECTION_EMAIL_STATUSES),
      ),
    )
    .returning({ id: configVersions.id })
  if (!superseded) {
    throw new HttpError(409, 'wait for rejection email delivery to finish before resubmitting')
  }
}

export async function getResubmissionDraft(
  database: Db,
  slug: string,
  authorId: string,
): Promise<ResubmissionDraft> {
  const [row] = await database
    .select({ config: configs, version: configVersions })
    .from(configs)
    .innerJoin(configVersions, eq(configVersions.configId, configs.id))
    .where(and(eq(configs.slug, slug), eq(configs.authorId, authorId)))
    .orderBy(desc(configVersions.versionNumber))
    .limit(1)
  if (!row) throw new HttpError(404, 'rejected submission not found')
  if (row.config.status !== 'draft' || row.config.currentVersionId !== null) {
    throw new HttpError(409, 'published or removed configs cannot be resubmitted')
  }
  if (row.version.status !== 'rejected') {
    throw new HttpError(409, 'only the latest rejected version can be resubmitted')
  }
  return {
    versionId: row.version.id,
    slug: row.config.slug,
    title: row.config.title,
    description: row.config.description,
    interpreter: row.version.interpreter,
    source: row.version.source,
    networkHosts: row.version.networkHosts ?? [],
  }
}

export async function createResubmissionVersion(
  database: Db,
  rejectedVersionId: string,
  input: PreparedResubmission,
): Promise<SubmitResult> {
  try {
    return await database.transaction(async (tx) => {
      const [target] = await tx
        .select({ config: configs, version: configVersions })
        .from(configVersions)
        .innerJoin(configs, eq(configs.id, configVersions.configId))
        .where(eq(configVersions.id, rejectedVersionId))
      if (!target) throw new HttpError(409, 'rejected version not found')
      const [latest] = await tx
        .select({ id: configVersions.id })
        .from(configVersions)
        .where(eq(configVersions.configId, target.config.id))
        .orderBy(desc(configVersions.versionNumber))
        .limit(1)
      assertResubmissionTarget(target, latest?.id, input.authorId)
      await supersedeRejectionDelivery(tx, target.version)
      await tx
        .update(configs)
        .set({
          title: input.title,
          description: input.description,
          interpreter: input.interpreter,
        })
        .where(eq(configs.id, target.config.id))
      const [version] = await tx
        .insert(configVersions)
        .values({
          configId: target.config.id,
          versionNumber: target.version.versionNumber + 1,
          source: input.source,
          interpreter: input.interpreter,
          contentSha256: input.contentSha256,
          sourceHtml: input.sourceHtml,
          status: 'pending',
          networkHosts: input.networkHosts,
          readsClaudeToken: input.readsClaudeToken,
          license: input.license,
          sourceUrl: input.sourceUrl,
        })
        .returning()
      if (!version) throw new Error('insert configVersions returned no row')
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
    if ((error as { code?: string }).code === '23505') {
      throw new HttpError(409, 'submission was already resubmitted')
    }
    throw error
  }
}
