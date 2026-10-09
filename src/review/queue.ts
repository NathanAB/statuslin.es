import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { db } from '@/db'
import { configs, configVersions, renderJobs, user } from '@/db/schema'
import { withHttpStatus } from '@/lib/http.server'
import { getPreviews } from '@/render/store'
import type { RenderedPreview } from '@/render/types'
import { assertAdmin } from './admin'
import { getLiveVersions, type LiveVersion } from './live-version'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface DashboardRow {
  config: {
    id: string
    slug: string
    status: string
    authorId: string
    author: { name: string; username: string | null; image: string | null } | null
    upvoteCount: number
    copyCount: number
    createdAt: Date
  }
  version: {
    id: string
    versionNumber: number
    title: string
    description: string
    interpreter: string
    source: string
    contentSha256: string
    status: string
    createdAt: Date
    networkHosts: string[]
    readsClaudeToken: boolean
    rejectionReason: string | null
    rejectionEmailStatus?: string | null
    approvalEmailStatus?: string | null
  }
  renderJob: {
    status: string
    attempts: number
    error: string | null
    createdAt: Date
    finishedAt: Date | null
  }
  previews: RenderedPreview[]
  /** Set on an admin queue row for an update: the config's live version, to review against. */
  live?: LiveVersion
}

// Problems first so a failure or a growing backlog is at the top where an admin will see it.
const RENDER_STATUS_ORDER = sql`case ${renderJobs.status}
  when 'failed' then 0
  when 'running' then 1
  when 'queued' then 2
  else 3 end`

export type RawRow = {
  config: typeof configs.$inferSelect
  version: typeof configVersions.$inferSelect
  job: Pick<
    typeof renderJobs.$inferSelect,
    'status' | 'attempts' | 'error' | 'createdAt' | 'finishedAt'
  >
  author: typeof user.$inferSelect | null
}

/** Shape a joined config/version/job/author row into a DashboardRow (+ fetch its previews). */
export async function mapRow(
  database: Db,
  r: RawRow,
  includeDeliveryState: boolean,
): Promise<DashboardRow> {
  const version: DashboardRow['version'] = {
    id: r.version.id,
    versionNumber: r.version.versionNumber,
    title: r.version.title,
    description: r.version.description,
    interpreter: r.version.interpreter,
    source: r.version.source,
    contentSha256: r.version.contentSha256,
    status: r.version.status,
    createdAt: r.version.createdAt,
    networkHosts: r.version.networkHosts ?? [],
    readsClaudeToken: r.version.readsClaudeToken ?? false,
    rejectionReason: r.version.rejectionReason,
  }
  if (includeDeliveryState) {
    version.rejectionEmailStatus = r.version.rejectionEmailStatus
    version.approvalEmailStatus = r.version.approvalEmailStatus
  }
  return {
    config: {
      id: r.config.id,
      slug: r.config.slug,
      status: r.config.status,
      authorId: r.config.authorId,
      author: r.author
        ? {
            name: r.author.name,
            username: r.author.username ?? null,
            image: r.author.image ?? null,
          }
        : null,
      upvoteCount: r.config.upvoteCount,
      copyCount: r.config.copyCount,
      createdAt: r.config.createdAt,
    },
    version,
    renderJob: {
      status: r.job.status,
      attempts: r.job.attempts,
      error: r.job.error,
      createdAt: r.job.createdAt,
      finishedAt: r.job.finishedAt,
    },
    previews: await getPreviews(database, r.version.contentSha256),
  }
}

export async function getDashboardRows(database: Db): Promise<DashboardRow[]> {
  const pendingRows = await database
    .select({ config: configs, version: configVersions, job: renderJobs, author: user })
    .from(configVersions)
    .innerJoin(configs, eq(configs.id, configVersions.configId))
    .innerJoin(renderJobs, eq(renderJobs.configVersionId, configVersions.id))
    .leftJoin(user, eq(user.id, configs.authorId))
    .where(eq(configVersions.status, 'pending'))
    .orderBy(RENDER_STATUS_ORDER, desc(configVersions.createdAt))
    .limit(50)
  const contactRows = await database
    .select({ config: configs, version: configVersions, job: renderJobs, author: user })
    .from(configVersions)
    .innerJoin(configs, eq(configs.id, configVersions.configId))
    .innerJoin(renderJobs, eq(renderJobs.configVersionId, configVersions.id))
    .leftJoin(user, eq(user.id, configs.authorId))
    .where(
      or(
        and(
          eq(configVersions.status, 'rejected'),
          inArray(configVersions.rejectionEmailStatus, [
            'pending',
            'sending',
            'failed',
            'unavailable',
            'ambiguous',
          ]),
        ),
        and(
          eq(configVersions.status, 'approved'),
          inArray(configVersions.approvalEmailStatus, [
            'pending',
            'sending',
            'failed',
            'unavailable',
            'ambiguous',
          ]),
        ),
      ),
    )
    .orderBy(desc(configVersions.createdAt))
    .limit(50)
  const out: DashboardRow[] = []
  const seen = new Set<string>()
  const liveVersions = await getLiveVersions(
    database,
    pendingRows.flatMap((r) => liveVersionIdOf(r) ?? []),
  )
  for (const r of [...pendingRows, ...contactRows]) {
    // One row per version. There's no DB uniqueness on render_jobs.config_version_id, so a stray
    // second job row would otherwise duplicate the version. The ordering puts the highest-priority
    // job first, so keep that one.
    if (seen.has(r.version.id)) continue
    seen.add(r.version.id)
    const row = await mapRow(database, r, true)
    const liveId = liveVersionIdOf(r)
    const live = liveId === undefined ? undefined : liveVersions.get(liveId)
    out.push(live ? { ...row, live } : row)
  }
  return out
}

/** An update is a pending version of a config whose live version is another version. */
function liveVersionIdOf(r: RawRow): string | undefined {
  const liveId = r.config.currentVersionId
  return r.version.status === 'pending' && liveId !== null && liveId !== r.version.id
    ? liveId
    : undefined
}

/** Header-shaped user, for rendering the signed-in admin in the page header. */
export interface DashboardUser {
  name: string
  username: string | null
  image: string | null
  role: string | null
}

export const getAdminDashboard = createServerFn({ method: 'GET' }).handler(() =>
  withHttpStatus(async () => {
    const admin = await assertAdmin(getRequestHeaders())
    const rows = await getDashboardRows(db)
    const user: DashboardUser = {
      name: admin.name,
      username: admin.username,
      image: admin.image,
      role: admin.role,
    }
    return { user, rows }
  }),
)
