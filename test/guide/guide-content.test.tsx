// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const { MINIMAL_SCRIPT, MINIMAL_SCRIPT_OUTPUT, SAMPLE_STDIN_JSON, SETTINGS_SNIPPET } = await import(
  '@/guide/examples'
)
const { GuideContent } = await import('@/guide/guide-content')

const esc = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const pre = (s: string) => `<pre class="shiki"><code>${esc(s)}</code></pre>`
const highlights = {
  payloadHtml: pre(SAMPLE_STDIN_JSON),
  scriptHtml: pre(MINIMAL_SCRIPT),
  settingsHtml: pre(SETTINGS_SNIPPET),
}

describe('GuideContent', () => {
  it('renders the h1 and all section headings', () => {
    render(<GuideContent highlights={highlights} />)
    expect(
      screen.getByRole('heading', { level: 1, name: /how to set up a claude code status line/i }),
    ).toBeTruthy()
    for (const heading of [
      /the fast paths/i,
      /wire up a script by hand/i,
      /two pitfalls/i,
      /going further/i,
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy()
    }
    for (const heading of [/the json your script receives/i, /a minimal working script/i]) {
      expect(screen.getByRole('heading', { level: 3, name: heading })).toBeTruthy()
    }
    expect(screen.queryByRole('heading', { level: 2, name: /the json/i })).toBeNull()
  })

  it('shows the example output once, next to the script, not in the intro', () => {
    const { container } = render(<GuideContent highlights={highlights} />)
    const page = container.textContent ?? ''
    expect(page).not.toContain("That's the whole mechanism")
    expect(page).not.toContain('What the script on this page prints')
    const previews = [...container.querySelectorAll('code')].filter(
      (el) => el.textContent === MINIMAL_SCRIPT_OUTPUT && !el.closest('.shiki'),
    )
    expect(previews).toHaveLength(1)
    expect(previews[0]?.parentElement?.previousElementSibling?.textContent).toMatch(
      /for the payload above it prints/i,
    )
  })

  it('shows the real payload fields, the script, its output, and the settings snippet', () => {
    const { container } = render(<GuideContent highlights={highlights} />)
    const page = container.textContent ?? ''
    for (const field of [
      '"context_window"',
      '"used_percentage"',
      '"total_cost_usd"',
      '"display_name"',
      '"rate_limits"',
      '"transcript_path"',
    ]) {
      expect(page).toContain(field)
    }
    expect(page).toContain('jq -r')
    expect(page).toContain(MINIMAL_SCRIPT_OUTPUT)
    expect(page).toContain('"statusLine"')
  })

  it('copies each code well from its overlay control', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    })
    render(<GuideContent highlights={highlights} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy settings' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SETTINGS_SNIPPET))

    fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SAMPLE_STDIN_JSON))

    fireEvent.click(screen.getByRole('button', { name: 'Copy script' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(MINIMAL_SCRIPT))
  })

  it('keeps the gallery fast path a link inside a card, not a card that is a link', () => {
    render(<GuideContent highlights={highlights} />)
    const heading = screen.getByRole('heading', { name: /copy from the gallery/i })
    expect(heading.querySelector('a')).toBeNull()
    expect(screen.getByRole('link', { name: /browse the gallery/i })).toBeTruthy()
  })

  it('links to the gallery, resources, submit, and the official docs', () => {
    const { container } = render(<GuideContent highlights={highlights} />)
    for (const href of ['/', '/resources', '/submit']) {
      expect(container.querySelector(`a[href="${href}"]`)).not.toBeNull()
    }
    expect(
      container.querySelector('a[href="https://code.claude.com/docs/en/statusline"]'),
    ).not.toBeNull()
  })
})
