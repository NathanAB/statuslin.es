// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { modPath } from '@/lib/site'
import { STATUSLINE_ANYWHERE_MOD_SLUG } from '@/lib/statusline-anywhere'

const capture = vi.fn()
vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture }),
}))

const { DesktopNote } = await import('@/gallery/desktop-note')

afterEach(() => {
  capture.mockClear()
})

describe('DesktopNote', () => {
  it('points Claude Desktop users at statusline-anywhere', () => {
    const { container } = render(<DesktopNote />)
    expect(container.textContent).toBe(
      'In Claude Desktop? Add this status line with statusline-anywhere.',
    )
  })

  it('has one link: the plugin name, to its mod page, recorded with the config page surface', () => {
    render(<DesktopNote />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]?.textContent).toBe('statusline-anywhere')
    expect(links[0]?.getAttribute('href')).toBe(modPath(STATUSLINE_ANYWHERE_MOD_SLUG))
    fireEvent.click(links[0] as Element)
    expect(capture).toHaveBeenCalledWith('statusline_anywhere_link_clicked', {
      surface: 'config_page',
    })
  })
})
