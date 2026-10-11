import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// The drain renders through the app's `@/db`; point it at an in-memory database on the real migrations.
const pglite = vi.hoisted(async (): Promise<PGlite> => {
  const { PGlite } = await import('@electric-sql/pglite')
  return new PGlite()
})
vi.mock('@/db', async () => {
  const { drizzle } = await import('drizzle-orm/pglite')
  const { migrate } = await import('drizzle-orm/pglite/migrator')
  const schema = await import('@/db/schema')
  const db = drizzle({ client: await pglite, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  return { db }
})
const captureServerEvent = vi.hoisted(() => vi.fn())
const captureServerException = vi.hoisted(() => vi.fn())
vi.mock('@/lib/posthog-server', () => ({ captureServerEvent, captureServerException }))

const { db } = await import('@/db')
const schema = await import('@/db/schema')
const { submitConfig } = await import('@/submit/submit')
const { triggerRenderDrain } = await import('@/server/render-drain')

beforeAll(async () => {
  await db.insert(schema.user).values({
    id: 'u1',
    name: 'Author One',
    email: 'author1@test.com',
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
})
afterAll(async () => {
  await (await pglite).close()
})
beforeEach(async () => {
  await db.delete(schema.configs)
  captureServerEvent.mockClear()
  captureServerException.mockClear()
})
afterEach(() => {
  vi.unstubAllEnvs()
})

async function submitQueued(title: string): Promise<string> {
  const { versionId } = await submitConfig(db, {
    authorId: 'u1',
    title,
    description: '',
    interpreter: 'bash',
    source: `#!/bin/bash\necho ${title}`,
  })
  return versionId
}

async function jobStatus(versionId: string): Promise<string | undefined> {
  const [job] = await db
    .select()
    .from(schema.renderJobs)
    .where(eq(schema.renderJobs.configVersionId, versionId))
  return job?.status
}

describe('triggerRenderDrain', () => {
  it('renders a queued submission in this process and reports the drain', async () => {
    vi.stubEnv('RENDER_RUNNER', 'fake')
    const versionId = await submitQueued('Queued')

    triggerRenderDrain()

    await vi.waitFor(async () => expect(await jobStatus(versionId)).toBe('done'))
    await vi.waitFor(() =>
      expect(captureServerEvent).toHaveBeenCalledWith(
        'render_queue_drained',
        'render-worker',
        expect.objectContaining({ processed: 1, queuedRemaining: 0 }),
      ),
    )
  })

  it('never falls back to fake previews when the E2B key is missing', async () => {
    vi.stubEnv('RENDER_RUNNER', '')
    vi.stubEnv('E2B_API_KEY', '')
    const versionId = await submitQueued('No key')

    triggerRenderDrain()

    await vi.waitFor(() => expect(captureServerException).toHaveBeenCalled())
    expect(String(captureServerException.mock.calls[0]?.[0])).toContain('E2B_API_KEY')
    expect(await jobStatus(versionId)).toBe('queued')
  })
})
