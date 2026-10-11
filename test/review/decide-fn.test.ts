import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    inputValidator: (validator: (data: never) => unknown) =>
      ({
        handler: (handler: (args: { data: unknown }) => unknown) => (args: { data: never }) =>
          handler({ data: validator(args.data) }),
      }) as const,
  }),
}))
vi.mock('@tanstack/react-start/server', () => ({ getRequestHeaders: () => new Headers() }))
vi.mock('@/lib/http.server', () => ({ withHttpStatus: (run: () => unknown) => run() }))
vi.mock('@/review/admin', () => ({ assertAdmin: vi.fn(async () => ({ id: 'admin' })) }))
// The render job rows the admin's update matched: one job, or none when nothing is re-queueable.
const updatedJobs = vi.hoisted(() => ({ rows: [{ id: 'job-1' }] as { id: string }[] }))
vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => [] }) }),
    update: () => ({
      set: () => ({ where: () => ({ returning: async () => updatedJobs.rows }) }),
    }),
  },
}))
const triggerRenderDrain = vi.hoisted(() => vi.fn())
vi.mock('@/server/render-drain', () => ({ triggerRenderDrain }))

const { requeueRenderJobFn, runNetworkPreviewFn } = await import('@/review/decide')
const VERSION = { data: { versionId: 'version-1' } } as never

beforeEach(() => {
  updatedJobs.rows = [{ id: 'job-1' }]
  triggerRenderDrain.mockReset()
})

describe.each([
  ['re-queue', requeueRenderJobFn],
  ['Run network preview', runNetworkPreviewFn],
])('the admin %s action', (_name, action) => {
  it('starts rendering the job in this process', async () => {
    await action(VERSION)

    expect(triggerRenderDrain).toHaveBeenCalledOnce()
  })

  it('renders nothing when there is no job to send back', async () => {
    updatedJobs.rows = []

    await expect(action(VERSION)).rejects.toMatchObject({ status: 409 })
    expect(triggerRenderDrain).not.toHaveBeenCalled()
  })
})
