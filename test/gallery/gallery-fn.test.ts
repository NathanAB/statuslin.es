import { beforeEach, describe, expect, it, vi } from 'vitest'

const getPublishedCount = vi.hoisted(() => vi.fn())
const getPublishedConfigs = vi.hoisted(() => vi.fn())
const getAvailableTags = vi.hoisted(() => vi.fn())
const captureServerException = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    inputValidator: (validator: (data: never) => unknown) =>
      ({
        handler: (handler: (args: { data: unknown }) => unknown) => (args: { data: never }) =>
          handler({ data: validator(args.data) }),
      }) as const,
  }),
  createServerOnlyFn: (fn: unknown) => fn,
}))
vi.mock('@/db', () => ({ db: { name: 'database' } }))
vi.mock('@/lib/http.server', () => ({ withHttpStatus: (run: () => unknown) => run() }))
vi.mock('@/lib/posthog-server', () => ({ captureServerException }))
vi.mock('@/gallery/facet-queries', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAvailableTags,
}))
vi.mock('@/gallery/queries', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPublishedCount,
  getPublishedConfigs,
}))

const { getGallery } = await import('@/gallery/functions')

beforeEach(() => {
  getPublishedCount.mockReset().mockResolvedValue(25)
  getPublishedConfigs.mockReset().mockResolvedValue([{ slug: 'a-line' }])
  getAvailableTags.mockReset().mockResolvedValue(['git'])
  captureServerException.mockReset()
})

describe('getGallery', () => {
  it('returns the live gallery when the database answers', async () => {
    const result = await getGallery({ data: { sort: 'new', page: 2 } })
    expect(result).toEqual({
      cards: [{ slug: 'a-line' }],
      page: 2,
      pageCount: 3,
      availableTags: ['git'],
    })
    expect(captureServerException).not.toHaveBeenCalled()
  })

  it('degrades to an empty gallery when a database read fails', async () => {
    getPublishedCount.mockRejectedValue(new Error('write CONNECT_TIMEOUT'))

    const result = await getGallery({ data: {} })

    expect(result).toEqual({ cards: [], page: 1, pageCount: 1, availableTags: [] })
  })

  it('reports the failure so a real outage stays visible', async () => {
    const error = new Error('write CONNECT_TIMEOUT')
    getPublishedConfigs.mockRejectedValue(error)

    await getGallery({ data: {} })

    expect(captureServerException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ source: 'server-fn' }),
    )
  })
})
