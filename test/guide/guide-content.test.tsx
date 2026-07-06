// @vitest-environment jsdom
// test/guide/guide-content.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// GuideContent's internal links use TanStack Router's <Link>; stub it to a plain anchor
// (same convention as test/ui/site-footer.test.tsx).
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

// Build the highlights fixture from the real example strings so the assertions below keep
// testing real content, not a stand-in. `pre` mirrors the shape highlightSource() produces
// (see src/lib/highlight.ts): a `.shiki` <pre><code>` wrapping escaped source.
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
      /the json claude code sends your script/i,
      /a minimal working script/i,
      /good to know/i,
      /going further/i,
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy()
    }
  })

  it('shows the real payload fields, the script, its output, and the settings snippet', () => {
    const { container } = render(<GuideContent highlights={highlights} />)
    const page = container.textContent ?? ''
    // Payload comes from scenarios.ts — spot-check fields that must appear.
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
