// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STATUSLINE_ANYWHERE_URL } from '@/lib/statusline-anywhere'

const capture = vi.fn()
vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture }),
}))

const { DesktopNote } = await import('@/adopt/desktop-note')

afterEach(() => {
  capture.mockClear()
})

describe('DesktopNote', () => {
  it('tells Claude Desktop users their status line needs statusline-anywhere', () => {
    const { container } = render(<DesktopNote />)
    expect(container.textContent).toBe(
      "Using Claude Desktop? It doesn't show custom status lines. statusline-anywhere adds this one above the prompt.",
    )
  })

  it('sits in a muted panel with a Desktop icon', () => {
    const { container } = render(<DesktopNote />)
    expect(container.firstElementChild?.className.split(' ')).toContain('bg-muted')
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('links the plugin repo in a new tab', () => {
    render(<DesktopNote />)
    const link = screen.getByRole('link', { name: 'statusline-anywhere' })
    expect(link.getAttribute('href')).toBe(STATUSLINE_ANYWHERE_URL)
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('records the click in PostHog with the config page as its surface', () => {
    render(<DesktopNote />)
    fireEvent.click(screen.getByRole('link', { name: 'statusline-anywhere' }))
    expect(capture).toHaveBeenCalledWith('statusline_anywhere_link_clicked', {
      surface: 'config_page',
    })
  })
})
