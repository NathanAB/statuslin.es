import { eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { previews } from '@/db/schema'
import type { AnsiSegment, BehaviorTrace, RenderedPreview } from './types'

// biome-ignore lint/suspicious/noExplicitAny: Drizzle db type varies by driver (postgres-js / pglite); the query surface used here is identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export async function storePreviews(
  db: Db,
  scriptSha: string,
  items: RenderedPreview[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(previews).where(eq(previews.scriptSha, scriptSha))
    if (items.length === 0) return
    await tx.insert(previews).values(
      items.map((p) => ({
        scriptSha,
        scenarioKey: p.scenarioKey,
        segments: p.segments,
        rawStdout: p.rawStdout,
        exitCode: p.exitCode,
        timedOut: p.timedOut ? 1 : 0,
        trace: p.trace,
      })),
    )
  })
}

export async function getPreviews(db: Db, scriptSha: string): Promise<RenderedPreview[]> {
  const rows = await db.select().from(previews).where(eq(previews.scriptSha, scriptSha))
  return rows.map((r) => ({
    scenarioKey: r.scenarioKey,
    segments: r.segments as AnsiSegment[],
    rawStdout: r.rawStdout,
    exitCode: r.exitCode,
    timedOut: r.timedOut === 1,
    trace: r.trace as BehaviorTrace,
  }))
}
