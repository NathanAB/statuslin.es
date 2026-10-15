import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSession = vi.hoisted(() => vi.fn())
const getModDraftFn = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth-functions', () => ({ getSession }))
vi.mock('@/mods/submit-fn', () => ({ getModDraftFn }))

const { validateSubmitSearch } = await import('@/submit/submit-page')
const { loadModSubmitPage } = await import('@/mods/submit-page')

beforeEach(() => {
  getSession.mockReset().mockResolvedValue({ id: 'ada', name: 'Ada' })
  getModDraftFn.mockReset().mockResolvedValue({ kind: 'update', slug: 'meter' })
})

describe('the mod choice on /submit', () => {
  it('keeps kind=mod with its draft slug, and drops any other kind', () => {
    expect(validateSubmitSearch({ kind: 'mod', update: 'meter' })).toEqual({
      kind: 'mod',
      update: 'meter',
    })
    expect(validateSubmitSearch({ kind: 'theme' })).toEqual({})
  })

  it('loads the submitter’s own mod for an update or a fix', async () => {
    await expect(loadModSubmitPage({ update: 'meter' })).resolves.toMatchObject({
      user: { id: 'ada' },
      draft: { kind: 'update', slug: 'meter' },
    })
    expect(getModDraftFn).toHaveBeenCalledWith({ data: { slug: 'meter', kind: 'update' } })

    await loadModSubmitPage({ resubmit: 'meter' })
    expect(getModDraftFn).toHaveBeenLastCalledWith({
      data: { slug: 'meter', kind: 'resubmission' },
    })
  })

  it('loads no draft for a new mod, and nothing for a signed-out visitor', async () => {
    await expect(loadModSubmitPage({})).resolves.toMatchObject({ draft: null })
    getSession.mockResolvedValue(null)
    await expect(loadModSubmitPage({ update: 'meter' })).resolves.toEqual({
      user: null,
      draft: null,
    })
    expect(getModDraftFn).not.toHaveBeenCalledWith({ data: { slug: 'meter', kind: 'update' } })
  })
})
