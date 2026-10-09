import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSession = vi.hoisted(() => vi.fn())
const getResubmissionDraftFn = vi.hoisted(() => vi.fn())
const getUpdateDraftFn = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}))
vi.mock('@/lib/auth-functions', () => ({ getSession }))
vi.mock('@/submit/submit-fn', () => ({ getResubmissionDraftFn, getUpdateDraftFn }))

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
  getUpdateDraftFn.mockReset().mockResolvedValue({ kind: 'update', slug: 'live-line' })
})

describe('submit resubmission route', () => {
  it('keeps only a non-blank resubmit slug in validated search', () => {
    expect(validateSubmitSearch({ resubmit: '  my-line  ' })).toEqual({ resubmit: 'my-line' })
    expect(validateSubmitSearch({ resubmit: '   ' })).toEqual({})
    expect(validateSubmitSearch({ resubmit: 42 })).toEqual({})
  })

  it('loads the signed-in owner’s rejected draft from the search slug', async () => {
    await expect(loadSubmitPage({ resubmit: 'my-line' })).resolves.toMatchObject({
      user: { id: 'owner' },
      initial: { versionId: 'version-1', slug: 'my-line' },
    })
    expect(getResubmissionDraftFn).toHaveBeenCalledWith({ data: { slug: 'my-line' } })
  })

  it('keeps a normal signed-in visit blank', async () => {
    await expect(loadSubmitPage({})).resolves.toMatchObject({
      user: { id: 'owner' },
      initial: null,
    })
    expect(getResubmissionDraftFn).not.toHaveBeenCalled()
    expect(getUpdateDraftFn).not.toHaveBeenCalled()
  })
})

describe('submit update route', () => {
  it('keeps only a non-blank update slug in validated search', () => {
    expect(validateSubmitSearch({ update: '  live-line  ' })).toEqual({ update: 'live-line' })
    expect(validateSubmitSearch({ update: '   ' })).toEqual({})
    expect(validateSubmitSearch({ update: 42 })).toEqual({})
  })

  it('keeps only the resubmit slug when both are present', () => {
    expect(validateSubmitSearch({ resubmit: 'my-line', update: 'live-line' })).toEqual({
      resubmit: 'my-line',
    })
  })

  it('loads the signed-in owner’s live version from the search slug', async () => {
    await expect(loadSubmitPage({ update: 'live-line' })).resolves.toMatchObject({
      user: { id: 'owner' },
      initial: { kind: 'update', slug: 'live-line' },
    })
    expect(getUpdateDraftFn).toHaveBeenCalledWith({ data: { slug: 'live-line' } })
    expect(getResubmissionDraftFn).not.toHaveBeenCalled()
  })

  it('loads nothing for a signed-out visitor', async () => {
    getSession.mockResolvedValue(null)
    await expect(loadSubmitPage({ update: 'live-line' })).resolves.toEqual({
      user: null,
      initial: null,
    })
    expect(getUpdateDraftFn).not.toHaveBeenCalled()
  })
})
