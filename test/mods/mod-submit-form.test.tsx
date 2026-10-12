// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http'

const submitModFn = vi.hoisted(() => vi.fn())
vi.mock('@/mods/submit-fn', () => ({ submitModFn }))
const capture = vi.hoisted(() => vi.fn())
vi.mock('@posthog/react', () => ({ usePostHog: () => ({ capture }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

const { ModSubmitForm, modSubmitPageCopy } = await import('@/mods/mod-submit-form')
const LINK = 'https://github.com/octocat/mods/tree/main/plugins/meter'

beforeEach(() => {
  capture.mockReset()
  submitModFn.mockReset().mockResolvedValue({
    slug: 'meter',
    ref: 'main',
    commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
  })
})

describe('ModSubmitForm', () => {
  it('sends the link and title, then shows the commit the link was pinned to', async () => {
    render(<ModSubmitForm draft={null} />)
    fireEvent.change(screen.getByLabelText('GitHub link'), { target: { value: LINK } })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Context meter' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() =>
      expect(submitModFn).toHaveBeenCalledWith({ data: { link: LINK, title: 'Context meter' } }),
    )
    expect(await screen.findByText('Pinned meter to main at abcdef1.')).toBeTruthy()
  })

  it('sends an update for the mod it was opened for, keeping the live title', async () => {
    render(
      <ModSubmitForm
        draft={{ kind: 'update', slug: 'meter', title: 'Context meter', link: LINK }}
      />,
    )
    expect(screen.queryByLabelText('Title')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Submit update' }))

    await waitFor(() =>
      expect(submitModFn).toHaveBeenCalledWith({ data: { link: LINK, slug: 'meter' } }),
    )
  })

  it('shows the refusal and records only its status', async () => {
    submitModFn.mockRejectedValue(new HttpError(400, 'The repository root has no plugin.'))
    render(<ModSubmitForm draft={null} />)
    fireEvent.change(screen.getByLabelText('GitHub link'), { target: { value: LINK } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByText('The repository root has no plugin.')).toBeTruthy()
    expect(capture).toHaveBeenCalledWith('mod_submission_failed', { status: 400 })
  })
})

describe('modSubmitPageCopy', () => {
  it('names the page for a new mod, a fix and an update', () => {
    expect(modSubmitPageCopy(null).heading).toBe('Submit a mod')
    expect(
      modSubmitPageCopy({ kind: 'resubmission', slug: 'meter', title: 'M', link: LINK }).heading,
    ).toBe('Fix and resubmit')
    expect(
      modSubmitPageCopy({ kind: 'update', slug: 'meter', title: 'M', link: LINK }).heading,
    ).toBe('Submit an update')
  })
})
