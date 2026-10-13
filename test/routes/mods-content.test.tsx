// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GalleryModCard } from '@/gallery/gallery-items'
import { MODS_FAQ } from '@/mods/mods-page-faq'

vi.mock('@tanstack/react-router', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    Link: ({
      to,
      params,
      children,
    }: {
      to: string
      params?: Record<string, string>
      children: ReactNode
    }) => <a href={params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to}>{children}</a>,
  }
})
vi.mock('@/ui/shell', () => ({
  PageShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const { Route: ModsRoute } = await import('@/routes/mods.index')

afterEach(() => {
  vi.restoreAllMocks()
})

function mod(slug: string, title: string): GalleryModCard {
  return {
    modId: `id-${slug}`,
    slug,
    title,
    description: `${title} does a thing.`,
    authorGithub: 'octocat',
    copyCount: 1,
    tags: [],
    preview: [{ text: `${slug} preview` }],
    desktopShot: null,
  }
}

const MODS = [mod('meter', 'Meter'), mod('file-tree', 'File Tree')]

function renderPage(mods: GalleryModCard[]) {
  vi.spyOn(ModsRoute, 'useLoaderData').mockReturnValue({ mods, user: null })
  const Page = ModsRoute.options.component
  return render(Page ? <Page /> : null)
}

describe('/mods page', () => {
  it('shows a card per mod, each linking its page', () => {
    renderPage(MODS)

    expect(screen.getByRole('heading', { level: 1, name: 'Claude Code mods' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Meter' }).getAttribute('href')).toBe('/mods/meter')
    expect(screen.getByRole('link', { name: 'File Tree' }).getAttribute('href')).toBe(
      '/mods/file-tree',
    )
    expect(screen.queryByText('No mods are published yet.')).toBeNull()
  })

  it('points status line visitors at the gallery', () => {
    renderPage(MODS)

    expect(screen.getByRole('link', { name: 'Browse the gallery' }).getAttribute('href')).toBe('/')
  })

  it('answers the common questions under the cards', () => {
    renderPage(MODS)

    const faq = screen.getByRole('heading', { level: 2, name: 'Common questions' })
    const section = within(faq.parentElement as HTMLElement)
    for (const entry of MODS_FAQ) {
      expect(section.getByRole('heading', { level: 3, name: entry.question })).toBeTruthy()
    }
    const lastCard = screen.getByRole('link', { name: 'File Tree' })
    expect(lastCard.compareDocumentPosition(faq) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('says so when no mod is published', () => {
    renderPage([])

    expect(screen.getByText('No mods are published yet.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Meter' })).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Common questions' })).toBeTruthy()
  })
})
