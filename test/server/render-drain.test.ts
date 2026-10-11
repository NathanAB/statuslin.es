import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RenderInput, RenderResult } from '@/render/types'

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
// While `hang` is set, a fake render never finishes: the machine shuts down in the middle of it.
const render = vi.hoisted(() => ({ hang: false }))
vi.mock('@/render/fake-runner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/render/fake-runner')>()
  return {
    FakeSandboxRunner: class extends actual.FakeSandboxRunner {
      override render(input: RenderInput): Promise<RenderResult> {
        return render.hang ? new Promise(() => {}) : super.render(input)
      }
    },
  }
})
const captureServerEvent = vi.hoisted(() => vi.fn())
const captureServerException = vi.hoisted(() => vi.fn())
vi.mock('@/lib/posthog-server', () => ({ captureServerEvent, captureServerException }))

const { db } = await import('@/db')
const schema = await import('@/db/schema')
const { submitConfig } = await import('@/submit/submit')
const { STALE_RUNNING_JOB_MS } = await import('@/render/job-state')
const { stopRenderDrain, triggerRenderDrain } = await import('@/server/render-drain')

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
  // A drain triggered under NODE_ENV=production listens for the stop signals; keep them off the test process.
  process.off('SIGINT', stopRenderDrain)
  process.off('SIGTERM', stopRenderDrain)
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

  it('reports the cut-off jobs it found, so a stuck render can alert', async () => {
    vi.stubEnv('RENDER_RUNNER', 'fake')
    const versionId = await submitQueued('Cut off by a crash')
    await db
      .update(schema.renderJobs)
      .set({ status: 'running', startedAt: new Date(Date.now() - STALE_RUNNING_JOB_MS - 1000) })
      .where(eq(schema.renderJobs.configVersionId, versionId))

    triggerRenderDrain()

    await vi.waitFor(() =>
      expect(captureServerEvent).toHaveBeenCalledWith(
        'render_queue_drained',
        'render-worker',
        expect.objectContaining({ processed: 1, cutOffJobs: 1 }),
      ),
    )
  })

  it('refuses fake previews in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('RENDER_RUNNER', 'fake')
    const versionId = await submitQueued('Fake in prod')

    triggerRenderDrain()

    await vi.waitFor(() => expect(captureServerException).toHaveBeenCalled())
    expect(String(captureServerException.mock.calls[0]?.[0])).toContain('RENDER_RUNNER=fake')
    expect(await jobStatus(versionId)).toBe('queued')
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

// Last in the file: stopping the drain lasts for the life of the module.
describe('on shutdown', () => {
  it("listens for Fly's stop signals only on the deployed images", async () => {
    vi.stubEnv('RENDER_RUNNER', 'fake')
    triggerRenderDrain()
    expect(process.listeners('SIGINT')).not.toContain(stopRenderDrain)

    vi.stubEnv('NODE_ENV', 'production')
    triggerRenderDrain()
    expect(process.listeners('SIGINT')).toContain(stopRenderDrain)
    expect(process.listeners('SIGTERM')).toContain(stopRenderDrain)
    await vi.waitFor(() =>
      expect(captureServerEvent.mock.calls.length + captureServerException.mock.calls.length).toBe(
        2,
      ),
    )
  })

  it('puts the job it is rendering back in the queue and claims no more', async () => {
    vi.stubEnv('RENDER_RUNNER', 'fake')
    render.hang = true
    const versionId = await submitQueued('Cut off by a deploy')
    triggerRenderDrain()
    await vi.waitFor(async () => expect(await jobStatus(versionId)).toBe('running'))

    stopRenderDrain()

    await vi.waitFor(async () => expect(await jobStatus(versionId)).toBe('queued'))
    render.hang = false
    triggerRenderDrain()
    await vi.waitFor(() => expect(captureServerEvent).toHaveBeenCalledTimes(2))
    expect(captureServerEvent).toHaveBeenLastCalledWith(
      'render_queue_drained',
      'render-worker',
      expect.objectContaining({ processed: 0, queuedRemaining: 1 }),
    )
    expect(await jobStatus(versionId)).toBe('queued')
  })
})
