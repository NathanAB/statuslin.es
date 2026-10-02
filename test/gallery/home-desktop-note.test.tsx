// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STATUSLINE_ANYWHERE_URL } from '@/lib/statusline-anywhere'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

const capture = vi.fn()
vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture }),
}))

const { HomeDesktopNote } = await import('@/gallery/home-desktop-note')

afterEach(() => {
  capture.mockClear()
})

describe('HomeDesktopNote', () => {
  it('invites Claude desktop app users to add their status line', () => {
    const { container } = render(<HomeDesktopNote />)
    expect(container.textContent).toBe(
      'Using the Claude desktop app? Add your status line with statusline-anywhere. How to set it up →',
    )
  })

  it('links the plugin repo and records the click with the home surface', () => {
    render(<HomeDesktopNote />)
    const link = screen.getByRole('link', { name: 'statusline-anywhere' })
    expect(link.getAttribute('href')).toBe(STATUSLINE_ANYWHERE_URL)
    fireEvent.click(link)
    expect(capture).toHaveBeenCalledWith('statusline_anywhere_link_clicked', { surface: 'home' })
  })

  it('links the Claude Desktop guide', () => {
    render(<HomeDesktopNote />)
    expect(screen.getByRole('link', { name: 'How to set it up →' }).getAttribute('href')).toBe(
      '/guide/claude-desktop',
    )
  })
})
