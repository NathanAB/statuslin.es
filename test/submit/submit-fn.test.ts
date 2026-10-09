import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSession = vi.hoisted(() => vi.fn())
const getResubmissionDraft = vi.hoisted(() => vi.fn())
const getUpdateDraft = vi.hoisted(() => vi.fn())
const submitConfig = vi.hoisted(() => vi.fn())
const validateSubmitInput = vi.hoisted(() =>
  vi.fn((data: Record<string, unknown>) => ({
    title: data.title,
    description: data.description,
    interpreter: data.interpreter,
    source: data.source,
    networkHosts: data.networkHosts,
  })),
)

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
vi.mock('@/lib/posthog-server', () => ({ captureServerEvent: vi.fn() }))
vi.mock('@/lib/wake', () => ({ pingWorkerWake: vi.fn(), workerWakeUrl: vi.fn(() => null) }))
vi.mock('@/submit/submitted-event', () => ({
  submittedEvent: vi.fn(() => ({ event: 'submitted', distinctId: 'owner', properties: {} })),
}))
vi.mock('@/submit/submit', () => ({
  getResubmissionDraft,
  getUpdateDraft,
  submitConfig,
  validateSubmitInput,
}))

const { getResubmissionDraftFn, getUpdateDraftFn, submitConfigFn } = await import(
  '@/submit/submit-fn'
)
const FIELDS = {
  title: 'Corrected',
  description: '',
  interpreter: 'bash',
  source: 'echo corrected',
  networkHosts: [],
}
const REJECTED_VERSION_ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  getSession.mockReset().mockResolvedValue({ user: { id: 'owner' } })
  submitConfig.mockReset().mockResolvedValue({
    configId: 'config-1',
    versionId: 'version-2',
    slug: 'my-line',
  })
  getResubmissionDraft.mockReset().mockResolvedValue({ versionId: 'version-1' })
  getUpdateDraft.mockReset().mockResolvedValue({ kind: 'update', slug: 'my-line' })
})

describe('submitConfigFn resubmission boundary', () => {
  it('forwards the rejected version while deriving author ownership from the session', async () => {
    await submitConfigFn({
      data: {
        authorId: 'other',
        title: 'Corrected',
        description: '',
        interpreter: 'bash',
        source: 'echo corrected',
        networkHosts: [],
        rejectedVersionId: REJECTED_VERSION_ID,
      },
    } as never)

    expect(submitConfig).toHaveBeenCalledWith(
      { name: 'database' },
      {
        authorId: 'owner',
        title: 'Corrected',
        description: '',
        interpreter: 'bash',
        source: 'echo corrected',
        networkHosts: [],
      },
      { rejectedVersionId: REJECTED_VERSION_ID },
    )
  })

  it('loads a draft using the signed-in user id', async () => {
    await getResubmissionDraftFn({ data: { slug: 'my-line' } } as never)

    expect(getResubmissionDraft).toHaveBeenCalledWith({ name: 'database' }, 'my-line', 'owner')
  })

  it.each([
    ['non-string slug', () => getResubmissionDraftFn({ data: { slug: 42 } } as never)],
    [
      'non-string rejected version',
      () =>
        submitConfigFn({
          data: {
            title: 'Corrected',
            description: '',
            interpreter: 'bash',
            source: 'echo corrected',
            networkHosts: [],
            rejectedVersionId: 42,
          },
        } as never),
    ],
    [
      'malformed rejected version UUID',
      () =>
        submitConfigFn({
          data: {
            title: 'Corrected',
            description: '',
            interpreter: 'bash',
            source: 'echo corrected',
            networkHosts: [],
            rejectedVersionId: 'not-a-uuid',
          },
        } as never),
    ],
  ])('rejects a %s with a controlled 400', (_name, call) => {
    expect(call).toThrow(expect.objectContaining({ status: 400 }))
  })
})

describe('submitConfigFn update boundary', () => {
  it('forwards a trimmed update slug while deriving the author from the session', async () => {
    await submitConfigFn({
      data: { ...FIELDS, authorId: 'other', updateSlug: '  my-line ' },
    } as never)

    expect(submitConfig).toHaveBeenCalledWith(
      { name: 'database' },
      { ...FIELDS, authorId: 'owner' },
      { updateSlug: 'my-line' },
    )
  })

  it('loads an update draft using the signed-in user id', async () => {
    await expect(getUpdateDraftFn({ data: { slug: 'my-line' } } as never)).resolves.toEqual({
      kind: 'update',
      slug: 'my-line',
    })
    expect(getUpdateDraft).toHaveBeenCalledWith({ name: 'database' }, 'my-line', 'owner')
  })

  it('requires a session to load an update draft', async () => {
    getSession.mockResolvedValue(null)
    await expect(getUpdateDraftFn({ data: { slug: 'my-line' } } as never)).rejects.toMatchObject({
      status: 401,
    })
    expect(getUpdateDraft).not.toHaveBeenCalled()
  })

  it.each([
    ['non-string update draft slug', () => getUpdateDraftFn({ data: { slug: 42 } } as never)],
    [
      'malformed update slug',
      () => submitConfigFn({ data: { ...FIELDS, updateSlug: 'Not A Slug!' } } as never),
    ],
    [
      'non-string update slug',
      () => submitConfigFn({ data: { ...FIELDS, updateSlug: 7 } } as never),
    ],
    [
      'request naming both a rejected version and an update',
      () =>
        submitConfigFn({
          data: { ...FIELDS, rejectedVersionId: REJECTED_VERSION_ID, updateSlug: 'my-line' },
        } as never),
    ],
  ])('rejects a %s with a controlled 400', (_name, call) => {
    expect(call).toThrow(expect.objectContaining({ status: 400 }))
  })
})
