// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SubmitForm } from '@/submit/submit-form'

// The form imports a TanStack server function; stub it so the component renders in jsdom.
const submitConfigFn = vi.hoisted(() => vi.fn())
vi.mock('@/submit/submit-fn', () => ({ submitConfigFn }))

// The form captures analytics on submit; stub the hook so it renders and submits in jsdom.
vi.mock('@posthog/react', () => ({ usePostHog: () => ({ capture: vi.fn() }) }))

const toastSuccess = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { success: toastSuccess } }))

const USER = { name: 'Test User', username: 'test' }

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Statusline' } })
  fireEvent.change(screen.getByLabelText('Source code'), {
    target: { value: '#!/usr/bin/env bash\necho hi' },
  })
}

beforeEach(() => {
  submitConfigFn.mockReset().mockResolvedValue({ slug: 'my-slug' })
  toastSuccess.mockReset()
})

describe('SubmitForm', () => {
  it('renders the description field as a multiline textarea', () => {
    render(<SubmitForm user={USER} />)
    const description = screen.getByLabelText('Description')
    expect(description.tagName).toBe('TEXTAREA')
  })

  it('shows a CC0 license grant: the submitter releases the script for anyone to use', () => {
    render(<SubmitForm user={USER} />)
    const grant = screen.getByText(/right to share/i)
    expect(grant.textContent).toMatch(/CC0|public domain/i)
  })

  it('fires a success toast on a successful submit', async () => {
    render(<SubmitForm user={USER} />)
    fillRequiredFields()

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1))
    expect(toastSuccess).toHaveBeenCalledWith("Queued for review — we'll take a look shortly.")
  })

  it('does not render the success message inline (it is a toast, not a text block)', async () => {
    render(<SubmitForm user={USER} />)
    fillRequiredFields()

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    expect(screen.queryByText(/Submitted/i)).toBeNull()
  })

  it('sends declared hosts when network access is enabled', async () => {
    render(<SubmitForm user={USER} />)
    fillRequiredFields()
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.change(screen.getByPlaceholderText('api.github.com'), {
      target: { value: 'wttr.in' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add host/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() =>
      expect(submitConfigFn).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ networkHosts: ['wttr.in'] }) }),
      ),
    )
  })

  it('sends no hosts when network access is off', async () => {
    render(<SubmitForm user={USER} />)
    fillRequiredFields()
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() =>
      expect(submitConfigFn).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ networkHosts: [] }) }),
      ),
    )
  })
})
