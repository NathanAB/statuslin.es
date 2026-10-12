import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSession = vi.hoisted(() => vi.fn())
const submitMod = vi.hoisted(() => vi.fn())
const captureServerEvent = vi.hoisted(() => vi.fn())

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
vi.mock('@/db', () => ({ db: { name: 'database' } }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }))
vi.mock('@/lib/http.server', () => ({ withHttpStatus: (run: () => unknown) => run() }))
vi.mock('@/lib/posthog-server', () => ({ captureServerEvent }))
vi.mock('@/render/mods/mod-sandbox', () => ({ withModSandbox: vi.fn() }))
vi.mock('@/mods/submit', async (orig) => ({
  ...(await orig<typeof import('@/mods/submit')>()),
  submitMod,
}))

const { submitModFn, validateModSubmitRequest } = await import('@/mods/submit-fn')
const LINK = 'https://github.com/octocat/mods/tree/main/plugins/meter'

beforeEach(() => {
  getSession.mockReset().mockResolvedValue({ user: { id: 'ada' } })
  captureServerEvent.mockReset()
  submitMod.mockReset().mockResolvedValue({
    modId: 'mod-1',
    versionId: 'ver-1',
    slug: 'meter',
    commitSha: 'a'.repeat(40),
    ref: 'main',
    isUpdate: false,
  })
})

describe('validateModSubmitRequest', () => {
  it('keeps a link, a title and the slug of the submitter’s own mod', () => {
    expect(validateModSubmitRequest({ link: LINK, title: 'Meter', slug: 'meter' })).toEqual({
      link: LINK,
      title: 'Meter',
      slug: 'meter',
    })
  })

  it.each([
    ['no link', {}],
    ['an empty link', { link: '  ' }],
    ['a link that is not text', { link: 42 }],
    ['an overlong link', { link: `${LINK}/${'x'.repeat(500)}` }],
    ['a slug that is not a plugin id', { link: LINK, slug: 'x;sh' }],
    ['an overlong title', { link: LINK, title: 't'.repeat(401) }],
  ])('refuses %s with a 400', (_name, data) => {
    expect(() => validateModSubmitRequest(data as Record<string, unknown>)).toThrow(
      expect.objectContaining({ status: 400 }),
    )
  })
})

describe('submitModFn', () => {
  it('refuses a signed-out visitor', async () => {
    getSession.mockResolvedValue(null)

    await expect(submitModFn({ data: { link: LINK } } as never)).rejects.toMatchObject({
      status: 401,
    })
    expect(submitMod).not.toHaveBeenCalled()
  })

  it('submits as the signed-in user and records mod_submitted', async () => {
    const result = await submitModFn({ data: { link: LINK, title: 'Meter' } } as never)

    expect(result).toMatchObject({ slug: 'meter', ref: 'main' })
    expect(submitMod).toHaveBeenCalledWith(
      { name: 'database' },
      { link: LINK, title: 'Meter', submittedBy: 'ada' },
      expect.objectContaining({ github: expect.any(Object) }),
    )
    expect(captureServerEvent).toHaveBeenCalledWith(
      'mod_submitted',
      'ada',
      expect.objectContaining({ slug: 'meter', versionId: 'ver-1', isUpdate: false }),
    )
  })
})
