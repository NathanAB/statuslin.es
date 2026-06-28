import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { configCardResponse, homeCardResponse } from '@/og/routes'
import { storePreviews } from '@/render/store'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  await db
    .insert(schema.user)
    .values({
      id: 'u1',
      name: 'Author One',
      username: 'authorone',
      email: 'a@test.com',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
  const sha = 'c'.repeat(64)
  const [cfg] = await db
    .insert(schema.configs)
    .values({
      slug: 'card-one',
      title: 'Card One',
      description: 'd',
      authorId: 'u1',
      interpreter: 'bash',
      status: 'published',
    })
    .returning()
  const [ver] = await db
    .insert(schema.configVersions)
    .values({
      configId: cfg!.id,
      versionNumber: 1,
      source: '#!/bin/bash\necho hi',
      interpreter: 'bash',
      contentSha256: sha,
      status: 'approved',
    })
    .returning()
  await db
    .update(schema.configs)
    .set({ currentVersionId: ver!.id })
    .where(eq(schema.configs.id, cfg!.id))
  await storePreviews(db, sha, [
    {
      scenarioKey: 'clean-main',
      segments: [
        { text: 'main', fg: null, bg: null, bold: false, italic: false, underline: false },
      ],
      rawStdout: 'main',
      exitCode: 0,
      timedOut: false,
      trace: { networkAttempts: [], sensitiveReads: [], spawnedProcesses: [] },
    },
  ])
})
afterAll(async () => {
  await client.close()
})

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
async function magic(res: Response) {
  return Array.from(new Uint8Array(await res.arrayBuffer()).slice(0, 8))
}

describe('og card responses', () => {
  it('home card response is image/png', async () => {
    const res = await homeCardResponse()
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(await magic(res)).toEqual(PNG_MAGIC)
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })
  it('per-config response renders the config card for a published slug', async () => {
    const res = await configCardResponse(db, 'card-one')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toContain('max-age=3600')
    expect(res.headers.get('cache-control')).not.toContain('immutable')
    expect(await magic(res)).toEqual(PNG_MAGIC)
  })
  it('unknown slug falls back to the home card with the SHORT cache (200, never 404; never immutable)', async () => {
    const res = await configCardResponse(db, 'does-not-exist')
    expect(res.status).toBe(200)
    expect(await magic(res)).toEqual(PNG_MAGIC)
    // The fallback MUST expire (1h) so a later-published slug refetches the real card — it must not
    // be the year-long immutable cache keyed to the home image.
    expect(res.headers.get('cache-control')).toContain('max-age=3600')
    expect(res.headers.get('cache-control')).not.toContain('immutable')
  })
})
