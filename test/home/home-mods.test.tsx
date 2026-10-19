// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import type { GalleryModCard } from '@/gallery/gallery-items'

const capture = vi.fn()
vi.mock('@posthog/react', () => ({ usePostHog: () => ({ capture }) }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    onClick,
    ...props
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLAnchorElement>
  }) => (
    <a
      href={params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to}
      onClick={(event) => {
        event.preventDefault()
        onClick?.(event)
      }}
      {...props}
    >
      {children}
    </a>
  ),
}))

const { HomeMods } = await import('@/home/home-mods')

afterEach(() => capture.mockClear())

const mod = (slug: string, title: string, shot = true): GalleryModCard => ({
  modId: `id-${slug}`,
  slug,
  title,
  description: `${title} draws something in Claude Desktop.`,
  authorGithub: `${slug}-dev`,
  copyCount: 3,
  tags: [],
  preview: null,
  desktopShot: shot ? { src: `/shots/${slug}.png`, width: 784, height: 142 } : null,
})

const FEATURED = mod('weather', 'Token Weather Usage')
const OTHERS = [mod('deck', 'Deck'), mod('bare', 'No Shot', false), mod('flow', 'Flow')]

const renderMods = () => render(<HomeMods featured={FEATURED} others={OTHERS} total={24} />)
const lit = () => document.querySelector('[data-slot="carousel-lit"]') as HTMLElement

describe('HomeMods', () => {
  it('heads the band, and links every mod', () => {
    renderMods()

    expect(screen.getByRole('heading', { level: 2, name: 'Mods' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'All 24 mods' }).getAttribute('href')).toBe('/mods')
  })

  it('shows each Desktop shot as a link to its mod, the featured mod first', () => {
    renderMods()

    const panels = within(
      screen.getByRole('list', { name: 'Mods in Claude Desktop' }),
    ).getAllByRole('link')
    expect(panels.map((panel) => panel.getAttribute('href'))).toEqual([
      '/mods/weather',
      '/mods/deck',
      '/mods/flow',
    ])
    const image = within(panels[0] as HTMLElement).getByRole('img', {
      name: 'Token Weather Usage running in Claude Desktop',
    })
    expect(image.getAttribute('width')).toBe('784')
    expect(image.getAttribute('height')).toBe('142')
    expect(image.getAttribute('loading')).toBe('lazy')
  })

  it('leaves out a mod with no Desktop shot', () => {
    renderMods()
    expect(screen.queryByRole('link', { name: /No Shot/ })).toBeNull()
  })

  it('names the lit mod above the row, starting with the featured one', () => {
    renderMods()

    expect(
      within(lit()).getByRole('link', { name: 'Token Weather Usage' }).getAttribute('href'),
    ).toBe('/mods/weather')
    expect(lit().textContent).toContain('Token Weather Usage draws something in Claude Desktop.')
    expect(lit().textContent).toContain('@weather-dev · 3 copies')
  })

  // The text block above the row is as tall as its longest mod, so flipping never moves the row.
  it("holds every mod's text in one place, the lit one shown and the rest kept out of sight", () => {
    renderMods()

    const texts = [...lit().children]
    expect(texts).toHaveLength(3)
    expect(texts.map((t) => t.getAttribute('aria-hidden'))).toEqual([null, 'true', 'true'])
    expect(texts[1]?.textContent).toContain('Deck draws something in Claude Desktop.')
    expect(texts[1]?.querySelector('a')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Next mod' }))

    expect(texts.map((t) => t.getAttribute('aria-hidden'))).toEqual(['true', null, 'true'])
  })

  it('steps through the mods with the previous and next buttons', () => {
    renderMods()
    const previous = screen.getByRole('button', { name: 'Previous mod' })
    const next = screen.getByRole('button', { name: 'Next mod' })
    expect(previous.getAttribute('aria-disabled')).toBe('true')

    fireEvent.click(next)
    expect(within(lit()).getByRole('heading').textContent).toBe('Deck')
    fireEvent.click(next)
    expect(within(lit()).getByRole('heading').textContent).toBe('Flow')
    expect(next.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('status').textContent).toBe('Flow, 3 of 3')

    fireEvent.click(previous)
    expect(within(lit()).getByRole('heading').textContent).toBe('Deck')
  })

  // A disabled button drops keyboard focus to the page; at the ends they only say they're done.
  it('keeps the buttons focusable at either end, and stepping past an end does nothing', () => {
    renderMods()
    const previous = screen.getByRole('button', { name: 'Previous mod' }) as HTMLButtonElement
    previous.focus()

    fireEvent.click(previous)

    expect(previous.disabled).toBe(false)
    expect(document.activeElement).toBe(previous)
    expect(within(lit()).getByRole('heading').textContent).toBe('Token Weather Usage')
  })

  it('reports the featured mod under its own surface, and the rest by their place in the row', () => {
    renderMods()
    const panels = within(
      screen.getByRole('list', { name: 'Mods in Claude Desktop' }),
    ).getAllByRole('link')

    fireEvent.click(panels[0] as HTMLElement)
    fireEvent.click(panels[2] as HTMLElement)

    expect(capture).toHaveBeenNthCalledWith(1, 'mod_card_clicked', {
      modId: 'id-weather',
      slug: 'weather',
      surface: 'home_featured_mod',
      position: 1,
    })
    expect(capture).toHaveBeenNthCalledWith(2, 'mod_card_clicked', {
      modId: 'id-flow',
      slug: 'flow',
      surface: 'home_mods_row',
      position: 3,
    })
  })

  it('shows nothing when no mod has a Desktop shot', () => {
    const { container } = render(
      <HomeMods featured={null} others={[OTHERS[1] as GalleryModCard]} total={1} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('has no axe violations', async () => {
    const { container } = renderMods()
    expect(await axe(container)).toHaveNoViolations()
  })
})
