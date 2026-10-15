import { eq, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, mods } from '@/db/schema'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface PublishedInventory {
  statusLines: number
  mods: number
  /** Copies of every published status line and mod together. */
  copyCount: number
}

const publishedTotals = (table: typeof configs | typeof mods) => ({
  count: sql<number>`count(*)::int`,
  copyCount: sql<number>`coalesce(sum(${table.copyCount}), 0)::int`,
})

export async function getPublishedInventory(db: Db): Promise<PublishedInventory> {
  const [[statusLines], [publishedMods]] = await Promise.all([
    db.select(publishedTotals(configs)).from(configs).where(eq(configs.status, 'published')),
    db.select(publishedTotals(mods)).from(mods).where(eq(mods.status, 'published')),
  ])
  return {
    statusLines: statusLines?.count ?? 0,
    mods: publishedMods?.count ?? 0,
    copyCount: (statusLines?.copyCount ?? 0) + (publishedMods?.copyCount ?? 0),
  }
}
