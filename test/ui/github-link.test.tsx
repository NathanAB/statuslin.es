// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { REPO_URL } from '@/lib/site'

const capture = vi.fn()
vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture }),
}))

const { GitHubLink } = await import('@/ui/github-link')

afterEach(() => {
  capture.mockClear()
})

describe('GitHubLink', () => {
  it('opens the repo in a new tab', () => {
    render(<GitHubLink look="bar" />)
    const link = screen.getByRole('link', { name: 'statuslin.es on GitHub' })
    expect(link.getAttribute('href')).toBe(REPO_URL)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('records the click in PostHog', () => {
    render(<GitHubLink look="bar" />)
    fireEvent.click(screen.getByRole('link', { name: 'statuslin.es on GitHub' }))
    expect(capture).toHaveBeenCalledWith('github_star_link_clicked')
  })

  // Just "GitHub", with no star icon, in the header bar and the phone menu alike.
  it('says GitHub, with no icon, in the header bar and the phone menu', () => {
    const { unmount } = render(<GitHubLink look="bar" />)
    expect(screen.getByRole('link').textContent).toBe('GitHub')
    expect(screen.getByRole('link').querySelector('svg')).toBeNull()
    unmount()
    render(<GitHubLink look="menu" />)
    expect(screen.getByRole('link').textContent).toBe('GitHub')
  })
})
