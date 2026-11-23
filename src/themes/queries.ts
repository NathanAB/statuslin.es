import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { mods, modThemePreviews, modThemes, modVersions } from '@/db/schema'
import { compactSegments } from '@/render/compact-segments'
import type { AnsiSegment } from '@/render/types'
import type { ThemeWindow } from './theme'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** One published theme as a visitor browses it: a card on /themes and on its plugin's page. */
export interface PublishedTheme {
  id: string
  /** The author's name for it, the one `/theme` lists. Shown as text. */
  name: string
  window: ThemeWindow
  /** The whole screen recorded with this theme selected. */
  preview: AnsiSegment[]
  /** The plugin a visitor installs to get it. */
  plugin: { slug: string; title: string; authorGithub: string }
}

/** Every theme of a published plugin's live version that has its preview. */
function publishedThemes(db: Db) {
  return db
    .select({
      id: modThemes.id,
      name: modThemes.name,
      window: modThemes.window,
      preview: modThemePreviews.segments,
      plugin: { slug: mods.slug, title: mods.title, authorGithub: mods.authorGithub },
    })
    .from(modThemes)
    .innerJoin(modThemePreviews, eq(modThemePreviews.themeId, modThemes.id))
    .innerJoin(modVersions, eq(modVersions.id, modThemes.modVersionId))
    .innerJoin(mods, and(eq(mods.currentVersionId, modVersions.id), eq(mods.status, 'published')))
    .$dynamic()
}

const byName = [asc(sql`lower(${modThemes.name})`), asc(modThemes.key)]

const compact = (cards: PublishedTheme[]): PublishedTheme[] =>
  cards.map((card) => ({ ...card, preview: compactSegments(card.preview) }))

/** /themes: the most installed plugins' themes first, each plugin's in name order. */
export async function getThemeCards(db: Db): Promise<PublishedTheme[]> {
  return compact(await publishedThemes(db).orderBy(desc(mods.copyCount), asc(mods.slug), ...byName))
}

/** The themes a published plugin's page lists, in name order. */
export async function getPublishedModThemes(db: Db, slug: string): Promise<PublishedTheme[]> {
  return compact(
    await publishedThemes(db)
      .where(eq(mods.slug, slug))
      .orderBy(...byName),
  )
}
