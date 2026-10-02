// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

const { HomeDesktopNote } = await import('@/gallery/home-desktop-note')

describe('HomeDesktopNote', () => {
  it('invites Claude desktop app users to add their status line', () => {
    const { container } = render(<HomeDesktopNote />)
    expect(container.textContent).toBe(
      'Using the Claude desktop app? Add your status line with statusline-anywhere. How to set it up →',
    )
  })

  it('has one link, to the Claude Desktop guide', () => {
    render(<HomeDesktopNote />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]?.textContent).toBe('How to set it up →')
    expect(links[0]?.getAttribute('href')).toBe('/guide/claude-desktop')
  })
})
