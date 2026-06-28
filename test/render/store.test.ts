import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getPreviews, storePreviews } from '@/render/store'
import type { RenderedPreview } from '@/render/types'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
})
afterAll(async () => {
  await client.close()
})

const preview: RenderedPreview = {
  scenarioKey: 'clean-main',
  segments: [
    { text: 'Opus', fg: 'rgb(128,0,128)', bg: null, bold: false, italic: false, underline: false },
  ],
  rawStdout: 'Opus',
  exitCode: 0,
  timedOut: false,
  trace: { networkAttempts: [], sensitiveReads: [], spawnedProcesses: [] },
}

describe('preview store', () => {
  it('stores and reads back previews by scriptSha', async () => {
    await storePreviews(db, 'sha123', [preview])
    const rows = await getPreviews(db, 'sha123')
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row?.scenarioKey).toBe('clean-main')
    expect(row?.segments[0]?.text).toBe('Opus')
  })
  it('replaces prior previews for the same scriptSha (idempotent re-render)', async () => {
    await storePreviews(db, 'sha-dup', [preview])
    await storePreviews(db, 'sha-dup', [preview])
    expect(await getPreviews(db, 'sha-dup')).toHaveLength(1)
  })
})
