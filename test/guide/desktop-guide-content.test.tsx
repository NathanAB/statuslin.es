// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STATUSLINE_ANYWHERE_URL } from '@/lib/statusline-anywhere'
import type { ModDesktopShot } from '@/mods/desktop-shot'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => <a href={params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to}>{children}</a>,
}))

const capture = vi.fn()
vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture }),
}))

const { DesktopGuideContent } = await import('@/guide/desktop-guide-content')

const SHOT = { src: '/mod-previews/v1/desktop.png?v=1', width: 800, height: 500 }
const WITH_SHOT: ModDesktopShot = { kind: 'shot', shot: SHOT }
const NO_SHOT: ModDesktopShot = { kind: 'no-shot' }
const UNPUBLISHED: ModDesktopShot = { kind: 'unpublished' }

function newSessionStep() {
  return screen.getByRole('heading', {
    level: 2,
    name: /^2\. open a new code session in claude desktop$/i,
  }).parentElement as HTMLElement
}

afterEach(() => {
  capture.mockClear()
})

describe('DesktopGuideContent', () => {
  it('renders the h1 and every section heading', () => {
    render(<DesktopGuideContent statuslineAnywhere={NO_SHOT} />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /claude code status line not showing in claude desktop/i,
      }),
    ).toBeTruthy()
    for (const heading of [
      /^1\. install the mod$/i,
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
    const { container } = render(<DesktopGuideContent statuslineAnywhere={NO_SHOT} />)
    expect(container.textContent).toMatch(/doesn.t run the statusLine command/i)
    expect(container.textContent).toContain('statusline-anywhere, a Claude Code mod, adds it back.')
  })

  // Installs count only through the mod page's copy button, so the guide sends readers there.
  it('sends the install to the mod page, then gives the new-session step and the version floor', () => {
    const { container } = render(<DesktopGuideContent statuslineAnywhere={NO_SHOT} />)
    const page = container.textContent ?? ''
    expect(
      screen.getByRole('link', { name: 'Install statusline-anywhere' }).getAttribute('href'),
    ).toBe('/mods/statusline-anywhere')
    expect(page).not.toMatch(/claude plugin/)
    expect(page).toMatch(/open a new Code session/i)
    expect(page).toContain('2.1.286')
  })

  it('stays short: no paragraph over 30 words', () => {
    const { container } = render(<DesktopGuideContent statuslineAnywhere={NO_SHOT} />)
    for (const p of container.querySelectorAll('p, li')) {
      expect((p.textContent ?? '').split(/\s+/).length).toBeLessThanOrEqual(30)
    }
  })

  it('links back to the gallery and the setup guide', () => {
    const { container } = render(<DesktopGuideContent statuslineAnywhere={NO_SHOT} />)
    expect(container.querySelector('a[href="/"]')).not.toBeNull()
    expect(container.querySelector('a[href="/guide"]')).not.toBeNull()
  })

  it('links the new-session step to the mod page for a screenshot when it has none to show', () => {
    render(<DesktopGuideContent statuslineAnywhere={NO_SHOT} />)
    const link = within(newSessionStep()).getByRole('link', { name: 'See a screenshot' })
    expect(link.getAttribute('href')).toBe('/mods/statusline-anywhere')
  })

  it("shows statusline-anywhere's real Desktop screenshot under the new-session step", () => {
    render(<DesktopGuideContent statuslineAnywhere={WITH_SHOT} />)
    const step = within(newSessionStep())
    const img = step.getByRole('img', { name: 'statusline-anywhere in Claude Desktop' })
    expect(img.getAttribute('src')).toBe(SHOT.src)
    expect(img.getAttribute('width')).toBe('800')
    expect(step.getByRole('link', { name: 'See its mod page' }).getAttribute('href')).toBe(
      '/mods/statusline-anywhere',
    )
    expect(step.queryByRole('link', { name: 'See a screenshot' })).toBeNull()
  })

  it('adds no image when there is no screenshot', () => {
    for (const statuslineAnywhere of [NO_SHOT, UNPUBLISHED]) {
      const { unmount } = render(<DesktopGuideContent statuslineAnywhere={statuslineAnywhere} />)
      expect(screen.queryByRole('img')).toBeNull()
      unmount()
    }
  })

  it('links no mod page while statusline-anywhere is unpublished, and keeps the step text', () => {
    const { container } = render(<DesktopGuideContent statuslineAnywhere={UNPUBLISHED} />)
    expect(container.querySelector('a[href="/mods/statusline-anywhere"]')).toBeNull()
    expect(newSessionStep().textContent).toContain(
      'Your status line shows above the prompt, in color. Needs Claude Code 2.1.286 or later.',
    )
  })

  it('records plugin link clicks in PostHog with the guide as its surface', () => {
    const { container } = render(<DesktopGuideContent statuslineAnywhere={NO_SHOT} />)
    const link = container.querySelector(`a[href="${STATUSLINE_ANYWHERE_URL}"]`)
    expect(link).not.toBeNull()
    fireEvent.click(link as Element)
    expect(capture).toHaveBeenCalledWith('statusline_anywhere_link_clicked', {
      surface: 'desktop_guide',
    })
  })
})
