import type { PgDatabase } from 'drizzle-orm/pg-core'
import { getHeroLines } from '@/gallery/hero-lines'
import { type ClientSafePreview, getConfigBySlug } from '@/gallery/queries'
import { highlightSource } from '@/lib/highlight'
import { getHeroMods } from '@/mods/gallery-queries'
import { buildMarketplace } from '@/mods/marketplace'
import { getMarketplaceRows, getModDetail, type ModDetail } from '@/mods/queries'
import { orderByScenario } from '@/render/scenarios'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/**
 * The real listings /how-it-works shows its steps with: the status line and the mod the home hero
 * leads with. Either is null when nothing of its kind is listed.
 */
export interface HowItWorksExamples {
  /** The status line and its previews, in session order, as the sandbox recorded them. */
  line: { title: string; previews: ClientSafePreview[] } | null
  /** The mod, and its entry's name and source as /marketplace.json serves them, raw and highlighted. */
  mod: { detail: ModDetail; entry: string; entryHtml: string } | null
}

async function lineExample(db: Db): Promise<HowItWorksExamples['line']> {
  const [top] = await getHeroLines(db)
  const detail = top && (await getConfigBySlug(db, top.slug))
  return detail ? { title: detail.title, previews: orderByScenario(detail.previews) } : null
}

async function modExample(db: Db, origin: string): Promise<HowItWorksExamples['mod']> {
  const [top] = await getHeroMods(db)
  if (!top) return null
  const [detail, rows] = await Promise.all([getModDetail(db, top.slug), getMarketplaceRows(db)])
  const row = rows.find((r) => r.slug === top.slug)
  if (!detail || !row) return null
  const [plugin] = buildMarketplace(origin, [row]).plugins
  if (!plugin) return null
  // The pin is in the source; the description and keywords would only run the block wide.
  const entry = JSON.stringify({ name: plugin.name, source: plugin.source }, null, 2)
  return { detail, entry, entryHtml: await highlightSource(entry, 'json') }
}

export async function getHowItWorksExamples(db: Db, origin: string): Promise<HowItWorksExamples> {
  const [line, mod] = await Promise.all([lineExample(db), modExample(db, origin)])
  return { line, mod }
}
