// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { REPO_URL } from '@/lib/site'

const capture = vi.fn()
vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture }),
}))

const { StarOnGitHubLink } = await import('@/ui/star-on-github-link')

afterEach(() => {
  capture.mockClear()
})

describe('StarOnGitHubLink', () => {
  it('opens the repo in a new tab', () => {
    render(<StarOnGitHubLink look="bar" />)
    const link = screen.getByRole('link', { name: 'Star statuslin.es on GitHub' })
    expect(link.getAttribute('href')).toBe(REPO_URL)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('records the click in PostHog', () => {
    render(<StarOnGitHubLink look="bar" />)
    fireEvent.click(screen.getByRole('link', { name: 'Star statuslin.es on GitHub' }))
    expect(capture).toHaveBeenCalledWith('github_star_link_clicked')
  })

  it('says Star in the header bar and Star on GitHub in the phone menu', () => {
    const { unmount } = render(<StarOnGitHubLink look="bar" />)
    expect(screen.getByRole('link').textContent).toBe('Star')
    unmount()
    render(<StarOnGitHubLink look="menu" />)
    expect(screen.getByRole('link').textContent).toBe('Star on GitHub')
  })
})
