import type { PgDatabase } from 'drizzle-orm/pg-core'
import { getModDetail, type ModDetail } from '@/mods/queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** The published mods among `slugs`, in that order. A draft, removed or unknown slug is left out. */
export async function publishedMods(db: Db, slugs: readonly string[]): Promise<ModDetail[]> {
  const mods = await Promise.all(slugs.map((slug) => getModDetail(db, slug)))
  return mods.filter((mod) => mod !== null)
}
