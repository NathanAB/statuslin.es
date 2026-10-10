import { desc, eq, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions } from '@/db/schema'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** When the current version went live, falling back to first submit if `reviewedAt` is missing. */
export const publishedAt = sql`coalesce(${configVersions.reviewedAt}, ${configs.createdAt})`

/** Published sitemap rows joined to their current version, newest published date first. */
export async function getPublishedSlugsForSitemap(
  db: Db,
): Promise<Array<{ slug: string; updatedAt: Date }>> {
  const rows = await db
    .select({
      slug: configs.slug,
      createdAt: configs.createdAt,
      reviewedAt: configVersions.reviewedAt,
    })
    .from(configs)
    .innerJoin(configVersions, eq(configVersions.id, configs.currentVersionId))
    .where(eq(configs.status, 'published'))
    .orderBy(desc(publishedAt))
  return rows.map((row) => ({
    slug: row.slug,
    updatedAt: row.reviewedAt ?? row.createdAt,
  }))
}
