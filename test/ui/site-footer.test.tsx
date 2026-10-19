// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// SiteFooter's Terms link uses TanStack Router's <Link>; stub it to a plain anchor.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const { CONTACT_EMAIL, MODS_PATH, REPO_URL, SITE_NAME } = await import('@/lib/site')
const { GUIDE_SUBPAGES, HOME_HEADING } = await import('@/lib/page-title')
const { SiteFooter } = await import('@/ui/site-footer')

describe('SiteFooter', () => {
  it('renders a mailto Contact link, the abuse-report path', () => {
    const { container } = render(<SiteFooter />)
    const link = container.querySelector('a[href^="mailto:"]') as HTMLAnchorElement
    expect(link).not.toBeNull()
    expect(link.getAttribute('href')).toBe(`mailto:${CONTACT_EMAIL}`)
    expect(link.textContent).toBe('Contact')
  })

  it('keeps every link in the footer navigation', () => {
    const { container } = render(<SiteFooter />)
    const nav = screen.getByRole('navigation', { name: 'Footer' })
    expect(nav.querySelectorAll('a').length).toBe(container.querySelectorAll('a').length)
    expect(nav.querySelectorAll('a').length).toBe(12)
  })

  it('says what the site is, with a copyright line', () => {
    render(<SiteFooter />)
    expect(screen.getByText(HOME_HEADING)).toBeTruthy()
    expect(screen.getByText(`© ${new Date().getFullYear()} ${SITE_NAME}`)).toBeTruthy()
  })

  // The home page puts its inventory line here: how many status lines and mods, copied how often.
  it("adds a page's own note under what the site is", () => {
    render(<SiteFooter note="32 status lines and 9 mods, copied 148 times." />)
    const note = screen.getByText('32 status lines and 9 mods, copied 148 times.')
    const tagline = screen.getByText(HOME_HEADING)
    expect(tagline.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Footer' }).contains(note)).toBe(false)
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

  it('links to the resources page', () => {
    const { container } = render(<SiteFooter />)
    const resources = container.querySelector('a[href="/resources"]') as HTMLAnchorElement
    expect(resources).not.toBeNull()
    expect(resources.textContent).toMatch(/resources/i)
  })

  it('links to the guide page', () => {
    const { container } = render(<SiteFooter />)
    const guide = container.querySelector('a[href="/guide"]') as HTMLAnchorElement
    expect(guide).not.toBeNull()
    expect(guide.textContent).toMatch(/guide/i)
  })

  it('links the mods gallery and the best status lines', () => {
    const { container } = render(<SiteFooter />)
    expect(container.querySelector(`a[href="${MODS_PATH}"]`)?.textContent).toBe('Mods')
    expect(container.querySelector('a[href="/status-lines/best"]')?.textContent).toBe(
      'Best status lines',
    )
  })

  it('links every guide subpage', () => {
    const { container } = render(<SiteFooter />)
    for (const { path } of GUIDE_SUBPAGES) {
      expect(container.querySelector(`a[href="${path}"]`), path).not.toBeNull()
    }
  })
})
