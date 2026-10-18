import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { type ModPageCopy, modPageCopySchema, readPageCopy } from '@/content/types'
import { mods, modVersions, submissions } from '@/db/schema'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** A published mod as the sitemap, llms.txt and llms-full.txt list it. */
export interface PublishedModListing {
  slug: string
  title: string
  description: string
  copyCount: number
  tags: string[]
  updatedAt: Date // when the current version went live: its approval, else (curated) its creation
  /** Null when the current version has no page copy in the current format. */
  generatedContent: ModPageCopy | null
}

export async function getPublishedModListings(db: Db): Promise<PublishedModListing[]> {
  const rows = await db
    .select({
      slug: mods.slug,
      title: mods.title,
      description: mods.description,
      copyCount: mods.copyCount,
      tags: mods.allTags,
      updatedAt: sql<Date>`coalesce(${submissions.reviewedAt}, ${modVersions.createdAt})`.mapWith(
        modVersions.createdAt,
      ),
      generatedContent: modVersions.generatedContent,
    })
    .from(mods)
    .innerJoin(
      modVersions,
      and(eq(modVersions.id, mods.currentVersionId), eq(modVersions.modId, mods.id)),
    )
    .leftJoin(submissions, eq(submissions.id, modVersions.id))
    .where(eq(mods.status, 'published'))
    .orderBy(desc(mods.copyCount), asc(mods.slug))
  return rows.map((row) => ({
    ...row,
    generatedContent: readPageCopy(modPageCopySchema, row.generatedContent),
  }))
}
