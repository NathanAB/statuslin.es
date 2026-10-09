// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    search,
    children,
    ...props
  }: {
    to: string
    search?: Record<string, string>
    children: React.ReactNode
  }) => (
    <a href={`${to}?${new URLSearchParams(search).toString()}`} {...props}>
      {children}
    </a>
  ),
}))

const { OwnerUpdateStrip } = await import('@/gallery/owner-update-strip')

describe('OwnerUpdateStrip', () => {
  it('tells the author updates are reviewed and links an outline button to the update form', () => {
    const { container } = render(<OwnerUpdateStrip slug="my-line" viewerIsAuthor />)
    expect(container.textContent).toContain(
      'This is your status line. Updates are reviewed before they go live.',
    )
    const link = screen.getByRole('link', { name: 'Submit update' })
    expect(link.getAttribute('href')).toBe('/submit?update=my-line')
    expect(link.getAttribute('data-slot')).toBe('button')
    expect(link.getAttribute('data-variant')).toBe('outline')
  })

  it('renders nothing for a viewer who is not the author', () => {
    const { container } = render(<OwnerUpdateStrip slug="my-line" viewerIsAuthor={false} />)
    expect(container.innerHTML).toBe('')
  })
})
