import { and, asc, eq, exists, isNull, max, ne, not, or, sql } from 'drizzle-orm'
import { alias, type PgDatabase } from 'drizzle-orm/pg-core'
import { type ModStatus, mods, modThemes, modVersions, submissions } from '@/db/schema'
import { versionIsRendered } from '@/mods/queries'
import { getReviewThemes, type ReviewTheme } from './theme-review'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/**
 * A curated plugin waiting to publish a version that carries themes. Publishing a curated plugin
 * stays the operator's CLI step; /admin shows its themes first, as it does a submitted plugin's.
 */
export interface CuratedThemeRow {
  mod: { slug: string; title: string; authorGithub: string; status: ModStatus }
  version: { id: string; versionNumber: number; repoUrl: string; path: string; commitSha: string }
  /** Rendered on both surfaces with every theme's preview, so publish-mod.ts accepts it. */
  rendered: boolean
  themes: ReviewTheme[]
}

const otherVersion = alias(modVersions, 'other_version')

/**
 * Curated plugins (no version ever submitted) whose newest version carries themes and isn't live
 * yet: a draft's first publish, or a published plugin's re-pin.
 */
export async function getCuratedThemeRows(database: Db): Promise<CuratedThemeRow[]> {
  // The newest version of the mod: the one import:mods added and render:mods renders.
  const newest = database
    .select({ value: max(otherVersion.versionNumber) })
    .from(otherVersion)
    .where(eq(otherVersion.modId, mods.id))
  const rows = await database
    .select({
      mod: {
        slug: mods.slug,
        title: mods.title,
        authorGithub: mods.authorGithub,
        status: mods.status,
      },
      version: {
        id: modVersions.id,
        versionNumber: modVersions.versionNumber,
        repoUrl: modVersions.repoUrl,
        path: modVersions.path,
        commitSha: modVersions.commitSha,
      },
      rendered: sql<boolean>`${versionIsRendered}`,
    })
    .from(mods)
    .innerJoin(modVersions, eq(modVersions.modId, mods.id))
    .where(
      and(
        eq(modVersions.versionNumber, newest),
        or(
          eq(mods.status, 'draft'),
          and(
            eq(mods.status, 'published'),
            or(isNull(mods.currentVersionId), ne(mods.currentVersionId, modVersions.id)),
          ),
        ),
        exists(
          database
            .select({ id: modThemes.id })
            .from(modThemes)
            .where(eq(modThemes.modVersionId, modVersions.id)),
        ),
        not(
          exists(
            database
              .select({ id: submissions.id })
              .from(submissions)
              .innerJoin(otherVersion, eq(otherVersion.id, submissions.modVersionId))
              .where(eq(otherVersion.modId, mods.id)),
          ),
        ),
      ),
    )
    .orderBy(asc(mods.slug))
  const themes = await getReviewThemes(
    database,
    rows.map(({ version }) => version.id),
  )
  return rows.map((row) => ({ ...row, themes: themes.get(row.version.id) ?? [] }))
}
