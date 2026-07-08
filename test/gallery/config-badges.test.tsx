// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// TanStack Router's <Link> needs a router context; stub it to a plain anchor that
// forwards `to`/`params`/`search` so we can assert href + stacking in isolation
// (same pattern as test/ui/stretched-link.test.tsx).
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    search,
    children,
    ...props
  }: {
    to: string
    params?: Record<string, string>
    search?: Record<string, string>
    children: React.ReactNode
  }) => {
    let href = params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to
    if (search) href += `?${new URLSearchParams(search).toString()}`
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  },
}))

const { ConfigBadges, iconFor } = await import('@/gallery/config-badges')
const { TooltipProvider } = await import('@/ui/tooltip')

const renderBadges = (props: { tags: string[]; networkHosts: string[] }) =>
  render(
    <TooltipProvider>
      <ConfigBadges {...props} />
    </TooltipProvider>,
  )

describe('iconFor', () => {
  it('maps known interpreter and capability slugs to their own fixed icon', () => {
    expect(iconFor('bash')).not.toBe(iconFor('network-access'))
    expect(iconFor('bash')).not.toBe(iconFor('reads-token'))
  })

  it('is stable for the same slug', () => {
    expect(iconFor('bash')).toBe(iconFor('bash'))
  })

  it('falls back to the feature icon for an unmapped feature-group slug', () => {
    // 'git' is a feature-group facet with no entry in TAG_ICON
    expect(iconFor('git')).not.toBe(iconFor('bash'))
    expect(iconFor('git')).not.toBe(iconFor('network-access'))
  })
})

describe('ConfigBadges', () => {
  it('renders one badge per tag', () => {
    renderBadges({ tags: ['bash', 'git'], networkHosts: [] })
    expect(screen.getByText('bash')).toBeTruthy()
    expect(screen.getByText('git')).toBeTruthy()
  })

  it('links a page tag (feature/interpreter) to its facet page', () => {
    const { container } = renderBadges({ tags: ['bash'], networkHosts: [] })
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(a.getAttribute('href')).toBe('/status-lines/bash')
  })

  it('does not link a capability tag (no page) — it is an info signal, not a browse link', () => {
    const { container } = renderBadges({ tags: ['network-access'], networkHosts: [] })
    expect(container.querySelector('a')).toBeNull()
    expect(screen.getByText('network access')).toBeTruthy()
  })

  it('does not link the reads-token capability tag', () => {
    const { container } = renderBadges({ tags: ['reads-token'], networkHosts: [] })
    expect(container.querySelector('a')).toBeNull()
    expect(screen.getByText('reads token')).toBeTruthy()
  })

  it('links only the page tags when a config mixes page and capability tags', () => {
    const { container } = renderBadges({ tags: ['bash', 'reads-token'], networkHosts: [] })
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/status-lines/bash'])
  })

  it('stacks the badge row above a card overlay so links stay clickable', () => {
    const { container } = renderBadges({ tags: ['bash'], networkHosts: [] })
    const row = container.firstChild as HTMLElement
    for (const cls of ['relative', 'z-10']) {
      expect(row.className.split(/\s+/)).toContain(cls)
    }
  })

  it('lists the declared hosts in the network-access badge accessible label', () => {
    renderBadges({ tags: ['network-access'], networkHosts: ['wttr.in', 'api.frankfurter.app'] })
    expect(screen.getByLabelText('Uses network: wttr.in, api.frankfurter.app')).toBeTruthy()
  })

  it('omits the accessible label when network-access has no declared hosts', () => {
    renderBadges({ tags: ['network-access'], networkHosts: [] })
    // Still renders the badge/link, just without the hosts label (no tooltip needed).
    expect(screen.getByText('network access')).toBeTruthy()
    expect(screen.queryByLabelText(/Uses network/)).toBeNull()
  })
})
