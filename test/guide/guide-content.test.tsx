// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
      screen.getByRole('heading', {
        level: 1,
        name: 'How to write your own Claude Code status line',
      }),
    ).toBeTruthy()
    for (const heading of [
      /the fast paths/i,
      /wire up a script by hand/i,
      /common questions/i,
      /going further/i,
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy()
    }
    expect(screen.queryByRole('heading', { name: /two pitfalls/i })).toBeNull()
    for (const heading of [
      /the json your script receives/i,
      /a minimal working script/i,
      /why isn.t the git branch in the json/i,
      /why is used_percentage null/i,
    ]) {
      expect(screen.getByRole('heading', { level: 3, name: heading })).toBeTruthy()
    }
    expect(screen.queryByRole('heading', { level: 2, name: /the json/i })).toBeNull()
    expect(
      screen.queryByRole('heading', { name: /how does this site know what a script prints/i }),
    ).toBeNull()
    expect(
      screen.getByRole('heading', { name: /why is used_percentage null/i }).nextElementSibling
        ?.textContent,
    ).toMatch(/\/\/ 0/)
  })

  // "Guide" read as "how to install one"; it's for writing your own, and says where installing is.
  it('says up top that it is for writing your own, and sends installers to the gallery', () => {
    render(<GuideContent highlights={highlights} />)
    const lead = screen.getByText(/This guide is for writing your own from scratch/)
    expect(
      within(lead).getByRole('link', { name: 'install one from the gallery' }).getAttribute('href'),
    ).toBe('/')
  })

  it('shows when the guide was last updated', () => {
    render(<GuideContent highlights={highlights} />)
    expect(screen.getByText(/^Updated \d{4}-\d{2}-\d{2}$/)).toBeTruthy()
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

  // Nested boxes read as clutter: sections are headings on the page, the fast paths one panel each.
  it('puts no section in a card, and no box inside another', () => {
    const { container } = render(<GuideContent highlights={highlights} />)
    expect(container.querySelector('[data-slot="card"]')).toBeNull()
    expect(screen.getByRole('region', { name: 'Wire up a script by hand' })).toBeTruthy()
    for (const panel of container.querySelectorAll('[data-slot="panel"]')) {
      expect(panel.querySelector('[data-slot="panel"]')).toBeNull()
    }
  })

  it('keeps the gallery fast path a link inside a card, not a card that is a link', () => {
    render(<GuideContent highlights={highlights} />)
    const heading = screen.getByRole('heading', { name: /copy from the gallery/i })
    expect(heading.querySelector('a')).toBeNull()
    expect(screen.getByRole('link', { name: /browse claude code status lines/i })).toBeTruthy()
  })

  it('says which git facts the JSON has and which a script must get from git', () => {
    render(<GuideContent highlights={highlights} />)
    const answer = screen.getByRole('heading', { name: /why isn.t the git branch in the json/i })
      .nextElementSibling?.textContent
    expect(answer).toMatch(/workspace\.repo/)
    expect(answer).toMatch(/run `?git`?/)
  })

  it('says the status line runs as soon as the settings are saved', () => {
    const { container } = render(<GuideContent highlights={highlights} />)
    const page = container.textContent ?? ''
    expect(page).not.toMatch(/on your next message/i)
    expect(page).toMatch(/as soon as you save/i)
  })

  it('links to the gallery, resources, submit, the other guides and the official docs', () => {
    const { container } = render(<GuideContent highlights={highlights} />)
    for (const href of [
      '/',
      '/resources',
      '/submit',
      '/guide/claude-desktop',
      '/guide/status-lines-vs-mods',
      '/guide/status-line-not-showing',
    ]) {
      expect(container.querySelector(`a[href="${href}"]`)).not.toBeNull()
    }
    expect(
      container.querySelector('a[href="https://code.claude.com/docs/en/statusline"]'),
    ).not.toBeNull()
  })

  it('links the payload fields to the facet pages that show them', () => {
    render(<GuideContent highlights={highlights} />)
    const hrefOf = (name: string) => screen.getByRole('link', { name }).getAttribute('href')
    expect(hrefOf('token usage')).toBe('/status-lines/token-usage')
    expect(hrefOf('usage limits')).toBe('/status-lines/quota')
    expect(hrefOf('git status')).toBe('/status-lines/git')
  })
})
