// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => (
    <a href={params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to} {...props}>
      {children}
    </a>
  ),
}))

const { CardMeta } = await import('@/gallery/card-meta')
const { TooltipProvider } = await import('@/ui/tooltip')

function renderMeta(props: Parameters<typeof CardMeta>[0]) {
  const { container } = render(
    <TooltipProvider>
      <CardMeta {...props} />
    </TooltipProvider>,
  )
  return container.firstElementChild as HTMLElement
}

describe('CardMeta', () => {
  it('links each tag with a page to it, as plain words in order, then the copy count', () => {
    const meta = renderMeta({ tags: ['git', 'cost', 'bash'], networkHosts: [], copyCount: 223 })

    const links = within(meta).getAllByRole('link')
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Git', '/status-lines/git'],
      ['Cost', '/status-lines/cost'],
      ['Bash', '/status-lines/bash'],
    ])
    expect(meta.textContent).toBe('Git·Cost·Bash·223 copies')
  })

  it('counts one copy in the singular', () => {
    expect(renderMeta({ tags: [], networkHosts: [], copyCount: 1 }).textContent).toBe('1 copy')
  })

  // They're trust signals for running someone else's script, so they stay visible, but they
  // aren't browse dimensions: no link.
  it('names network access and token reading without linking them, first', () => {
    const meta = renderMeta({
      tags: ['git', 'network-access', 'reads-token'],
      networkHosts: ['api.example.com'],
      copyCount: 2,
    })

    expect(meta.textContent).toBe('Network Access·Reads Token·Git·2 copies')
    expect(
      within(meta)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Git'])
    expect(screen.getByRole('img', { name: 'Uses network: api.example.com' })).toBeTruthy()
  })

  it('starts a mod card with the word Mod', () => {
    const meta = renderMeta({ kind: 'Mod', tags: ['git'], networkHosts: [], copyCount: 0 })

    expect(meta.textContent).toBe('Mod·Git·0 copies')
  })

  it('keeps the separators out of what a screen reader hears', () => {
    const meta = renderMeta({ tags: ['git'], networkHosts: [], copyCount: 3 })

    const dots = [...meta.querySelectorAll('[aria-hidden="true"]')]
    expect(dots.map((dot) => dot.textContent)).toEqual(['·'])
  })
})
