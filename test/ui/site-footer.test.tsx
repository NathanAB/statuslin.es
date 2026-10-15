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

const { CONTACT_EMAIL, MODS_PATH, REPO_URL } = await import('@/lib/site')
const { GUIDE_SUBPAGES } = await import('@/lib/page-title')
const { SiteFooter } = await import('@/ui/site-footer')

describe('SiteFooter', () => {
  it('renders a mailto Contact link, the abuse-report path', () => {
    const { container } = render(<SiteFooter />)
    const link = container.querySelector('a[href^="mailto:"]') as HTMLAnchorElement
    expect(link).not.toBeNull()
    expect(link.getAttribute('href')).toBe(`mailto:${CONTACT_EMAIL}`)
    expect(link.textContent).toBe('Contact')
  })

  it('lists the links one per item, so the separators sit between items', () => {
    const { container } = render(<SiteFooter />)
    const items = container.querySelectorAll('footer ul > li')
    expect(items.length).toBe(container.querySelectorAll('a').length)
    for (const item of items) expect(item.querySelectorAll('a').length).toBe(1)
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
