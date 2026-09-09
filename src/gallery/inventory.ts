import { eq, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs } from '@/db/schema'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface PublishedInventory {
  count: number
  copyCount: number
}

export async function getPublishedInventory(db: Db): Promise<PublishedInventory> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      copyCount: sql<number>`coalesce(sum(${configs.copyCount}), 0)::int`,
    })
    .from(configs)
    .where(eq(configs.status, 'published'))
  return { count: row?.count ?? 0, copyCount: row?.copyCount ?? 0 }
}
