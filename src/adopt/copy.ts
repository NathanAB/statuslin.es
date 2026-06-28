import { and, eq, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, copyEvents } from '@/db/schema'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Count a copy of a published config, deduped per client: copyCount goes up at most once per
 * `ipHash` per config. An approximate popularity signal (like a view count) — returns the
 * current count without incrementing if this ipHash already copied it, and 0 if the id is
 * malformed or the config is missing/not published. `ipHash` is an opaque per-person token
 * (an HMAC of the client IP), never the raw IP — see recordCopyFn. A null `ipHash` means there
 * was no trustworthy client IP: return the current count without counting or recording anything.
 */
export async function recordCopy(db: Db, configId: string, ipHash: string | null): Promise<number> {
  if (!UUID_RE.test(configId)) return 0
  return db.transaction(async (tx) => {
    // Must exist and be published before we count or record anything.
    const [cfg] = await tx
      .select({ copyCount: configs.copyCount })
      .from(configs)
      .where(and(eq(configs.id, configId), eq(configs.status, 'published')))
    if (!cfg) return 0
    // No trustworthy client IP → report the count but don't record or increment.
    if (ipHash === null) return cfg.copyCount
    // Dedup gate: a fresh (config, ipHash) inserts a row; a repeat hits the unique index and
    // returns nothing, so the counter is left untouched.
    const inserted = await tx
      .insert(copyEvents)
      .values({ configId, ipHash })
      .onConflictDoNothing()
      .returning({ id: copyEvents.id })
    if (inserted.length === 0) return cfg.copyCount
    const rows = await tx
      .update(configs)
      .set({ copyCount: sql`${configs.copyCount} + 1` })
      .where(eq(configs.id, configId))
      .returning({ copyCount: configs.copyCount })
    return rows[0]?.copyCount ?? cfg.copyCount + 1
  })
}
