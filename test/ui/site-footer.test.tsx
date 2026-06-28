// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// SiteFooter's Terms link uses TanStack Router's <Link>; stub it to a plain anchor.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const { CONTACT_EMAIL, REPO_URL } = await import('@/lib/site')
const { SiteFooter } = await import('@/ui/site-footer')

describe('SiteFooter', () => {
  it('renders a mailto contact link labelled for the abuse-report path', () => {
    const { container } = render(<SiteFooter />)
    const link = container.querySelector('a[href^="mailto:"]') as HTMLAnchorElement
    expect(link).not.toBeNull()
    expect(link.getAttribute('href')).toBe(`mailto:${CONTACT_EMAIL}`)
    // Text link now: the accessible name is the visible text, not an aria-label.
    expect(link.textContent).toMatch(/email/i)
  })

  it('renders a source link to the public repo that opens in a new tab', () => {
    const { container } = render(<SiteFooter />)
    const link = container.querySelector(`a[href="${REPO_URL}"]`) as HTMLAnchorElement
    expect(link).not.toBeNull()
    expect(link.textContent).toMatch(/github/i)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('links to the Terms page', () => {
    const { container } = render(<SiteFooter />)
    const link = container.querySelector('a[href="/terms"]') as HTMLAnchorElement
    expect(link).not.toBeNull()
    expect(link.textContent).toMatch(/terms/i)
  })

  it('renders inside a semantic footer element', () => {
    const { container } = render(<SiteFooter />)
    expect(container.querySelector('footer')).not.toBeNull()
  })
})
