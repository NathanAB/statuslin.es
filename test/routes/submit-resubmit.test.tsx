import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSession = vi.hoisted(() => vi.fn())
const getResubmissionDraftFn = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}))
vi.mock('@/lib/auth-functions', () => ({ getSession }))
vi.mock('@/submit/submit-fn', () => ({ getResubmissionDraftFn }))

const { loadSubmitPage, validateSubmitSearch } = await import('@/routes/submit')

beforeEach(() => {
  getSession.mockReset().mockResolvedValue({
    id: 'owner',
    name: 'Owner',
    username: 'owner',
    image: null,
    role: 'user',
  })
  getResubmissionDraftFn.mockReset().mockResolvedValue({
    versionId: 'version-1',
    slug: 'my-line',
  })
})

describe('submit resubmission route', () => {
  it('keeps only a non-blank resubmit slug in validated search', () => {
    expect(validateSubmitSearch({ resubmit: '  my-line  ' })).toEqual({ resubmit: 'my-line' })
    expect(validateSubmitSearch({ resubmit: '   ' })).toEqual({})
    expect(validateSubmitSearch({ resubmit: 42 })).toEqual({})
  })

  it('loads the signed-in owner’s rejected draft from the search slug', async () => {
    await expect(loadSubmitPage('my-line')).resolves.toMatchObject({
      user: { id: 'owner' },
      initial: { versionId: 'version-1', slug: 'my-line' },
    })
    expect(getResubmissionDraftFn).toHaveBeenCalledWith({ data: { slug: 'my-line' } })
  })

  it('keeps a normal signed-in visit blank', async () => {
    await expect(loadSubmitPage()).resolves.toMatchObject({ user: { id: 'owner' }, initial: null })
    expect(getResubmissionDraftFn).not.toHaveBeenCalled()
  })
})
