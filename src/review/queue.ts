import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { desc, eq, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { db } from '@/db'
import { configs, configVersions, renderJobs, user } from '@/db/schema'
import { auth } from '@/lib/auth'
import { HttpError } from '@/lib/http'
import { withHttpStatus } from '@/lib/http.server'
import { getPreviews } from '@/render/store'
import type { RenderedPreview } from '@/render/types'
import { assertAdmin } from './admin'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface DashboardRow {
  config: {
    id: string
    slug: string
    title: string
    description: string
    interpreter: string
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
    source: string
    contentSha256: string
    status: string
    createdAt: Date
    networkHosts: string[]
  }
  renderJob: {
    status: string
    attempts: number
    error: string | null
    createdAt: Date
    finishedAt: Date | null
  }
  previews: RenderedPreview[]
}

// Problems first so a failure or a growing backlog is at the top where an admin will see it.
const RENDER_STATUS_ORDER = sql`case ${renderJobs.status}
  when 'failed' then 0
  when 'running' then 1
  when 'queued' then 2
  else 3 end`

type RawRow = {
  config: typeof configs.$inferSelect
  version: typeof configVersions.$inferSelect
  job: typeof renderJobs.$inferSelect
  author: typeof user.$inferSelect | null
}

/** Shape a joined config/version/job/author row into a DashboardRow (+ fetch its previews). */
async function mapRow(database: Db, r: RawRow): Promise<DashboardRow> {
  return {
    config: {
      id: r.config.id,
      slug: r.config.slug,
      title: r.config.title,
      description: r.config.description,
      interpreter: r.config.interpreter,
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
    version: {
      id: r.version.id,
      versionNumber: r.version.versionNumber,
      source: r.version.source,
      contentSha256: r.version.contentSha256,
      status: r.version.status,
      createdAt: r.version.createdAt,
      networkHosts: r.version.networkHosts ?? [],
    },
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
  const rows = await database
    .select({ config: configs, version: configVersions, job: renderJobs, author: user })
    .from(configVersions)
    .innerJoin(configs, eq(configs.id, configVersions.configId))
    .innerJoin(renderJobs, eq(renderJobs.configVersionId, configVersions.id))
    .leftJoin(user, eq(user.id, configs.authorId))
    .where(eq(configVersions.status, 'pending'))
    .orderBy(RENDER_STATUS_ORDER, desc(configVersions.createdAt))
    .limit(50)
  const out: DashboardRow[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    // One row per version. There's no DB uniqueness on render_jobs.config_version_id, so a stray
    // second job row would otherwise duplicate the version. The ordering puts the highest-priority
    // job first, so keep that one.
    if (seen.has(r.version.id)) continue
    seen.add(r.version.id)
    out.push(await mapRow(database, r))
  }
  return out
}

/** Every config owned by `userId`, latest version each, any status — for the /me page. */
export async function getMySubmissionRows(database: Db, userId: string): Promise<DashboardRow[]> {
  const rows = await database
    .selectDistinctOn([configVersions.configId], {
      config: configs,
      version: configVersions,
      job: renderJobs,
      author: user,
    })
    .from(configVersions)
    .innerJoin(configs, eq(configs.id, configVersions.configId))
    .innerJoin(renderJobs, eq(renderJobs.configVersionId, configVersions.id))
    .leftJoin(user, eq(user.id, configs.authorId))
    .where(eq(configs.authorId, userId))
    // DISTINCT ON keeps the first row per config; lead the sort with configId + newest version.
    .orderBy(configVersions.configId, desc(configVersions.versionNumber))
  // Re-sort for display: newest config first (DISTINCT ON forced the configId-led order above).
  rows.sort((a, b) => b.config.createdAt.getTime() - a.config.createdAt.getTime())
  const out: DashboardRow[] = []
  for (const r of rows) out.push(await mapRow(database, r))
  return out
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

export const getMySubmissions = createServerFn({ method: 'GET' }).handler(() =>
  withHttpStatus(async () => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() })
    if (!session?.user) throw new HttpError(401, 'sign in required')
    const u = session.user as {
      id: string
      name: string
      username?: string | null
      image?: string | null
      role?: string | null
    }
    const rows = await getMySubmissionRows(db, u.id)
    const user: DashboardUser = {
      name: u.name,
      username: u.username ?? null,
      image: u.image ?? null,
      role: u.role ?? null,
    }
    return { user, rows }
  }),
)
