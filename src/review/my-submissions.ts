import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { desc, eq, inArray } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { db } from '@/db'
import { configs, configVersions, renderJobs, user } from '@/db/schema'
import { auth } from '@/lib/auth'
import { HttpError } from '@/lib/http'
import { withHttpStatus } from '@/lib/http.server'
import { type DashboardRow, type DashboardUser, mapRow } from './queue'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** A newer version of a published config, summarized for its author's /me card. */
export interface UpdateSummary {
  versionNumber: number
  status: string
  renderStatus: string
  /** The reviewer's reason, once the update was not accepted. */
  rejectionReason: string | null
}

export type MySubmissionRow = DashboardRow & { update: UpdateSummary | null }

const joinedRow = {
  config: configs,
  version: configVersions,
  job: renderJobs,
  author: user,
}

/** Every config owned by `userId`, any status — for the /me page. A published config shows its
 * live version, with any newer version summarized as `update`; others show their latest version. */
export async function getMySubmissionRows(
  database: Db,
  userId: string,
): Promise<MySubmissionRow[]> {
  const latestRows = await database
    .selectDistinctOn([configVersions.configId], joinedRow)
    .from(configVersions)
    .innerJoin(configs, eq(configs.id, configVersions.configId))
    .innerJoin(renderJobs, eq(renderJobs.configVersionId, configVersions.id))
    .leftJoin(user, eq(user.id, configs.authorId))
    .where(eq(configs.authorId, userId))
    // DISTINCT ON keeps the first row per config; lead the sort with configId + newest version.
    .orderBy(configVersions.configId, desc(configVersions.versionNumber))
  // Re-sort for display: newest config first (DISTINCT ON forced the configId-led order above).
  latestRows.sort((a, b) => b.config.createdAt.getTime() - a.config.createdAt.getTime())
  const liveIds = latestRows.flatMap((r) =>
    r.config.currentVersionId && r.config.currentVersionId !== r.version.id
      ? [r.config.currentVersionId]
      : [],
  )
  const liveRows =
    liveIds.length > 0
      ? await database
          .select(joinedRow)
          .from(configVersions)
          .innerJoin(configs, eq(configs.id, configVersions.configId))
          // Left join: legacy or seeded live versions may have no render_jobs row.
          .leftJoin(renderJobs, eq(renderJobs.configVersionId, configVersions.id))
          .leftJoin(user, eq(user.id, configs.authorId))
          .where(inArray(configVersions.id, liveIds))
      : []
  // A live version was published, so a missing job row stands in as a finished render.
  const liveById = new Map(
    liveRows.map((r) => [
      r.version.id,
      {
        ...r,
        job: r.job ?? {
          status: 'done',
          attempts: 0,
          error: null,
          createdAt: r.version.createdAt,
          finishedAt: null,
        },
      },
    ]),
  )
  const out: MySubmissionRow[] = []
  for (const latest of latestRows) {
    const liveRow = latest.config.currentVersionId
      ? liveById.get(latest.config.currentVersionId)
      : undefined
    const update =
      liveRow && latest.version.versionNumber > liveRow.version.versionNumber
        ? {
            versionNumber: latest.version.versionNumber,
            status: latest.version.status,
            renderStatus: latest.job.status,
            rejectionReason: latest.version.rejectionReason,
          }
        : null
    out.push({ ...(await mapRow(database, liveRow ?? latest, false)), update })
  }
  return out
}

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
