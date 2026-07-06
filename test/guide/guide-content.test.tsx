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

const { MINIMAL_SCRIPT_OUTPUT } = await import('@/guide/examples')
const { GuideContent } = await import('@/guide/guide-content')

describe('GuideContent', () => {
  it('renders the h1 and all section headings', () => {
    render(<GuideContent />)
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
    const { container } = render(<GuideContent />)
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
    const { container } = render(<GuideContent />)
    for (const href of ['/', '/resources', '/submit']) {
      expect(container.querySelector(`a[href="${href}"]`)).not.toBeNull()
    }
    expect(
      container.querySelector('a[href="https://code.claude.com/docs/en/statusline"]'),
    ).not.toBeNull()
  })
})
