import { asc, desc, eq, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { type ModPageCopy, modPageCopySchema, readPageCopy } from '@/content/types'
import { mods, modThemes, modVersions, submissions } from '@/db/schema'
import { versionIsThemeOnly } from './queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** A published plugin, mod or theme plugin, as the sitemap, llms.txt, llms-full.txt and the gallery search list it. */
export interface PublishedModListing {
  slug: string
  title: string
  description: string
  copyCount: number
  tags: string[]
  authorGithub: string
  updatedAt: Date // when the current version went live: its approval, else (curated) its creation
  /** Null when the current version has no page copy in the current format. */
  generatedContent: ModPageCopy | null
  /** A plugin of theme files alone: listed as themes, never as a mod (ADR 0012). */
  themeOnly: boolean
  /** Its current version carries themes, so they are cards on /themes. */
  hasThemes: boolean
}

const versionHasThemes = sql<boolean>`exists (select 1 from ${modThemes} where ${modThemes.modVersionId} = ${modVersions.id})`

export async function getPublishedModListings(db: Db): Promise<PublishedModListing[]> {
  const rows = await db
    .select({
      slug: mods.slug,
      title: mods.title,
      description: mods.description,
      copyCount: mods.copyCount,
      tags: mods.allTags,
      authorGithub: mods.authorGithub,
      updatedAt: sql<Date>`coalesce(${submissions.reviewedAt}, ${modVersions.createdAt})`.mapWith(
        modVersions.createdAt,
      ),
      generatedContent: modVersions.generatedContent,
      themeOnly: versionIsThemeOnly,
      hasThemes: versionHasThemes,
    })
    .from(mods)
    .innerJoin(modVersions, eq(modVersions.id, mods.currentVersionId))
    .leftJoin(submissions, eq(submissions.id, modVersions.id))
    .where(eq(mods.status, 'published'))
    .orderBy(desc(mods.copyCount), asc(mods.slug))
  return rows.map((row) => ({
    ...row,
    generatedContent: readPageCopy(modPageCopySchema, row.generatedContent),
  }))
}
