import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { type ModFootprint, mods, modThemePreviews, modThemes, modVersions } from '@/db/schema'
import { versionIsThemeOnly } from '@/mods/queries'
import { compactSegments } from '@/render/compact-segments'
import type { AnsiSegment } from '@/render/types'
import type { ThemeKind, ThemeWindow } from './theme'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** One published theme as a visitor browses it: a card on /themes and on its plugin's page. */
export interface PublishedTheme {
  id: string
  /** The author's name for it, the one `/theme` lists. Shown as text. */
  name: string
  /** Where it applies: the terminal, or (next) Claude Desktop. */
  kind: ThemeKind
  window: ThemeWindow
  /** The whole screen recorded with this theme selected. */
  preview: AnsiSegment[]
  /** The plugin a visitor installs to get it. */
  plugin: {
    /** The plugin's mod id, which a copy of its install command counts against. */
    id: string
    slug: string
    title: string
    authorGithub: string
    /** What its hooks modules can reach, or null for a plugin of theme files alone. */
    code: { footprint: ModFootprint } | null
  }
}

/** Every theme of a published plugin's live version that has its preview. */
function publishedThemes(db: Db) {
  return db
    .select({
      id: modThemes.id,
      name: modThemes.name,
      kind: modThemes.kind,
      window: modThemes.window,
      preview: modThemePreviews.segments,
      plugin: { id: mods.id, slug: mods.slug, title: mods.title, authorGithub: mods.authorGithub },
      themeOnly: versionIsThemeOnly,
      footprint: modVersions.footprint,
    })
    .from(modThemes)
    .innerJoin(modThemePreviews, eq(modThemePreviews.themeId, modThemes.id))
    .innerJoin(modVersions, eq(modVersions.id, modThemes.modVersionId))
    .innerJoin(mods, and(eq(mods.currentVersionId, modVersions.id), eq(mods.status, 'published')))
    .$dynamic()
}

const byName = [asc(sql`lower(${modThemes.name})`), asc(modThemes.key)]

type ThemeRow = Awaited<ReturnType<typeof publishedThemes>>[number]

const toCards = (rows: ThemeRow[]): PublishedTheme[] =>
  rows.map(({ themeOnly, footprint, ...row }) => ({
    ...row,
    preview: compactSegments(row.preview),
    plugin: { ...row.plugin, code: themeOnly ? null : { footprint } },
  }))

/** /themes: the most installed plugins' themes first, each plugin's in name order. */
export async function getThemeCards(db: Db): Promise<PublishedTheme[]> {
  return toCards(await publishedThemes(db).orderBy(desc(mods.copyCount), asc(mods.slug), ...byName))
}

/** The themes a published plugin's page lists, in name order. */
export async function getPublishedModThemes(db: Db, slug: string): Promise<PublishedTheme[]> {
  return toCards(
    await publishedThemes(db)
      .where(eq(mods.slug, slug))
      .orderBy(...byName),
  )
}
