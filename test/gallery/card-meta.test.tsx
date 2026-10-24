// @vitest-environment jsdom
import { render, within } from '@testing-library/react'
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

function renderMeta(props: Parameters<typeof CardMeta>[0]) {
  const { container } = render(<CardMeta {...props} />)
  return container.firstElementChild as HTMLElement
}

describe('CardMeta', () => {
  it('links each tag with a page to it, as plain words in order, then the copy count', () => {
    const meta = renderMeta({ tags: ['git', 'cost', 'bash'], copyCount: 223 })

    const links = within(meta).getAllByRole('link')
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Git', '/status-lines/git'],
      ['Cost', '/status-lines/cost'],
      ['Bash', '/status-lines/bash'],
    ])
    expect(meta.textContent).toBe('Git·Cost·Bash·223 installs')
  })

  it('counts one copy in the singular', () => {
    expect(renderMeta({ tags: [], copyCount: 1 }).textContent).toBe('1 install')
  })

  it('lists the tags its page header shows, leaving out what the code can reach', () => {
    const meta = renderMeta({ tags: ['network-access', 'git', 'reads-token'], copyCount: 2 })

    expect(meta.textContent).toBe('Git·2 installs')
  })

  it('starts a mod card with the word Mod', () => {
    const meta = renderMeta({ kind: 'Mod', tags: ['git'], copyCount: 0 })

    expect(meta.textContent).toBe('Mod·Git·0 installs')
  })

  it('keeps the separators out of what a screen reader hears', () => {
    const meta = renderMeta({ tags: ['git'], copyCount: 3 })

    const dots = [...meta.querySelectorAll('[aria-hidden="true"]')]
    expect(dots.map((dot) => dot.textContent)).toEqual(['·'])
  })
})
