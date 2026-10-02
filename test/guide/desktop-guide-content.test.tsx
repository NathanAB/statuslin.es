// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  STATUSLINE_ANYWHERE_INSTALL_COMMAND,
  STATUSLINE_ANYWHERE_URL,
} from '@/lib/statusline-anywhere'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

const capture = vi.fn()
vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture }),
}))

const { DesktopGuideContent } = await import('@/guide/desktop-guide-content')

afterEach(() => {
  capture.mockClear()
})

describe('DesktopGuideContent', () => {
  it('renders the h1 and every section heading', () => {
    render(<DesktopGuideContent />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /claude code status line not showing in claude desktop/i,
      }),
    ).toBeTruthy()
    for (const heading of [
      /^1\. paste this into a terminal$/i,
      /^2\. open a new code session in claude desktop$/i,
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy()
    }
    expect(screen.queryByText(/updated/i)).toBeNull()
    for (const removed of [/fix it/i, /limits/i, /why it happens/i]) {
      expect(screen.queryByRole('heading', { name: removed })).toBeNull()
    }
  })

  it('explains the cause and the plugin in the intro', () => {
    const { container } = render(<DesktopGuideContent />)
    expect(container.textContent).toMatch(/doesn.t run the statusLine command/i)
    expect(container.textContent).toContain(
      'statusline-anywhere, a Claude Code plugin, adds it back.',
    )
  })

  it('gives the one-paste install, the new-session step, and the version floor', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    })
    const { container } = render(<DesktopGuideContent />)
    const page = container.textContent ?? ''
    expect(page).toContain(STATUSLINE_ANYWHERE_INSTALL_COMMAND)
    expect(page).toMatch(/open a new Code session/i)
    expect(page).toContain('2.1.286')

    fireEvent.click(screen.getByRole('button', { name: 'Copy install command' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(STATUSLINE_ANYWHERE_INSTALL_COMMAND))
  })

  it('stays short: no paragraph over 30 words', () => {
    const { container } = render(<DesktopGuideContent />)
    for (const p of container.querySelectorAll('p, li')) {
      expect((p.textContent ?? '').split(/\s+/).length).toBeLessThanOrEqual(30)
    }
  })

  it('links back to the gallery and the setup guide', () => {
    const { container } = render(<DesktopGuideContent />)
    expect(container.querySelector('a[href="/"]')).not.toBeNull()
    expect(container.querySelector('a[href="/guide"]')).not.toBeNull()
  })

  it('records plugin link clicks in PostHog with the guide as its surface', () => {
    const { container } = render(<DesktopGuideContent />)
    const link = container.querySelector(`a[href="${STATUSLINE_ANYWHERE_URL}"]`)
    expect(link).not.toBeNull()
    fireEvent.click(link as Element)
    expect(capture).toHaveBeenCalledWith('statusline_anywhere_link_clicked', {
      surface: 'desktop_guide',
    })
  })
})
