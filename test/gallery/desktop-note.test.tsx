// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STATUSLINE_ANYWHERE_URL } from '@/lib/statusline-anywhere'

const capture = vi.fn()
vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture }),
}))

const { DesktopNote } = await import('@/gallery/desktop-note')

afterEach(() => {
  capture.mockClear()
})

describe('DesktopNote', () => {
  it('invites Claude desktop app users to add their status line', () => {
    const { container } = render(<DesktopNote surface="home" />)
    expect(container.textContent).toBe(
      'Using the Claude desktop app? Add your status line with statusline-anywhere.',
    )
  })

  it('has one link: the plugin name, to its repo, recorded with the home surface', () => {
    render(<DesktopNote surface="home" />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]?.textContent).toBe('statusline-anywhere')
    expect(links[0]?.getAttribute('href')).toBe(STATUSLINE_ANYWHERE_URL)
    fireEvent.click(links[0] as Element)
    expect(capture).toHaveBeenCalledWith('statusline_anywhere_link_clicked', { surface: 'home' })
  })

  it('records config page clicks with the config page surface', () => {
    render(<DesktopNote surface="config_page" />)
    fireEvent.click(screen.getByRole('link', { name: 'statusline-anywhere' }))
    expect(capture).toHaveBeenCalledWith('statusline_anywhere_link_clicked', {
      surface: 'config_page',
    })
  })
})
