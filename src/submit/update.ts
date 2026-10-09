import { and, eq, inArray, lte, max, ne } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, renderJobs } from '@/db/schema'
import { HttpError } from '@/lib/http'
import type { PreparedVersion } from './resubmit'
import type { SubmitResult } from './submit'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** The published config an update targets, its live version, and its highest version number. */
export interface UpdateBase {
  config: typeof configs.$inferSelect
  live: typeof configVersions.$inferSelect
  latestVersionNumber: number
}

export interface UpdateDraft {
  kind: 'update'
  slug: string
  title: string
  description: string
  interpreter: string
  source: string
  networkHosts: string[]
}

interface ListedFields {
  title: string
  description: string
  interpreter: string
  source: string
  networkHosts: string[]
}

const NOT_PUBLISHED = 'only a published status line can be updated'

function sameHosts(a: string[], b: string[]): boolean {
  const sortedB = [...b].sort()
  return a.length === b.length && [...a].sort().every((host, i) => host === sortedB[i])
}

function sameAsLive(live: ListedFields, input: ListedFields): boolean {
  return (
    live.title === input.title &&
    live.description === input.description &&
    live.interpreter === input.interpreter &&
    live.source === input.source &&
    sameHosts(live.networkHosts, input.networkHosts)
  )
}

// Drizzle wraps driver errors, so the Postgres code sits on the cause.
function isUniqueViolation(error: unknown): boolean {
  const { code, cause } = error as { code?: string; cause?: { code?: string } }
  return code === '23505' || cause?.code === '23505'
}

export async function findUpdateBase(
  database: Db,
  slug: string,
  authorId: string,
): Promise<UpdateBase> {
  const [config] = await database
    .select()
    .from(configs)
    .where(and(eq(configs.slug, slug), eq(configs.authorId, authorId)))
  if (!config) throw new HttpError(404, 'status line not found')
  if (config.status !== 'published' || config.currentVersionId === null) {
    throw new HttpError(409, NOT_PUBLISHED)
  }
  const [live] = await database
    .select()
    .from(configVersions)
    .where(eq(configVersions.id, config.currentVersionId))
  if (!live) throw new HttpError(409, NOT_PUBLISHED)
  const [latest] = await database
    .select({ versionNumber: max(configVersions.versionNumber) })
    .from(configVersions)
    .where(eq(configVersions.configId, config.id))
  return { config, live, latestVersionNumber: latest?.versionNumber ?? live.versionNumber }
}

export async function getUpdateDraft(
  database: Db,
  slug: string,
  authorId: string,
): Promise<UpdateDraft> {
  const { config, live } = await findUpdateBase(database, slug, authorId)
  return {
    kind: 'update',
    slug: config.slug,
    title: live.title,
    description: live.description,
    interpreter: live.interpreter,
    source: live.source,
    networkHosts: live.networkHosts ?? [],
  }
}

/** The base for an update the author owns that changes the live version, or null when `slug`
 * names no update. Runs before highlighting, so a refused update costs no Shiki. */
export async function findChangedUpdateBase(
  database: Db,
  slug: string | undefined,
  authorId: string,
  input: ListedFields,
): Promise<UpdateBase | null> {
  if (!slug) return null
  const base = await findUpdateBase(database, slug, authorId)
  if (sameAsLive({ ...base.live, networkHosts: base.live.networkHosts ?? [] }, input)) {
    throw new HttpError(400, 'Nothing changed from the live version')
  }
  return base
}

export async function createUpdateVersion(
  database: Db,
  base: UpdateBase,
  input: PreparedVersion,
): Promise<SubmitResult> {
  try {
    return await database.transaction(async (tx) => {
      const [config] = await tx
        .select({ status: configs.status })
        .from(configs)
        .where(eq(configs.id, base.config.id))
      if (config?.status !== 'published') throw new HttpError(409, NOT_PUBLISHED)
      const superseded = await tx
        .update(configVersions)
        .set({ status: 'superseded' })
        .where(
          and(
            eq(configVersions.configId, base.config.id),
            eq(configVersions.status, 'pending'),
            lte(configVersions.versionNumber, base.latestVersionNumber),
          ),
        )
        .returning({ id: configVersions.id })
      if (superseded.length > 0) {
        await tx.delete(renderJobs).where(
          and(
            inArray(
              renderJobs.configVersionId,
              superseded.map((version) => version.id),
            ),
            ne(renderJobs.status, 'done'),
          ),
        )
      }
      const [version] = await tx
        .insert(configVersions)
        .values({
          configId: base.config.id,
          versionNumber: base.latestVersionNumber + 1,
          title: input.title,
          description: input.description,
          source: input.source,
          interpreter: input.interpreter,
          contentSha256: input.contentSha256,
          sourceHtml: input.sourceHtml,
          status: 'pending',
          networkHosts: input.networkHosts,
          readsClaudeToken: input.readsClaudeToken,
          license: base.live.license,
          sourceUrl: base.live.sourceUrl,
        })
        .returning()
      if (!version) throw new Error('insert configVersions returned no row')
      await tx.insert(renderJobs).values({
        configVersionId: version.id,
        status: input.networkHosts.length > 0 ? 'held' : 'queued',
      })
      return { configId: base.config.id, versionId: version.id, slug: base.config.slug }
    })
  } catch (error) {
    // The next version number comes from the read before this transaction, so a concurrent
    // update that got there first collides on the (config_id, version_number) unique index.
    if (isUniqueViolation(error)) {
      throw new HttpError(409, 'another update to this status line was just submitted')
    }
    throw error
  }
}
