// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GalleryModCard } from '@/gallery/gallery-items'
import { modsFaq } from '@/mods/mods-page-faq'

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

const ORIGIN = 'https://statuslin.es'

function renderPage(mods: GalleryModCard[]) {
  vi.spyOn(ModsRoute, 'useLoaderData').mockReturnValue({ mods, user: null, origin: ORIGIN })
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

  it('links the guides that compare mods with status lines and explain mod safety', () => {
    const { container } = renderPage(MODS)

    for (const href of ['/guide/status-lines-vs-mods', '/guide/are-claude-code-mods-safe']) {
      expect(container.querySelector(`a[href="${href}"]`), href).not.toBeNull()
    }
  })

  it('answers the common questions under the cards', () => {
    renderPage(MODS)

    const faq = screen.getByRole('heading', { level: 2, name: 'Common questions' })
    const section = within(faq.parentElement as HTMLElement)
    for (const entry of modsFaq(ORIGIN)) {
      expect(section.getByRole('heading', { level: 3, name: entry.question })).toBeTruthy()
    }
    const lastCard = screen.getByRole('link', { name: 'File Tree' })
    expect(lastCard.compareDocumentPosition(faq) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows every question and answer that the FAQ JSON-LD marks up, in the same words', async () => {
    const { container } = renderPage(MODS)
    process.env.BETTER_AUTH_URL = ORIGIN
    const head = (await ModsRoute.options.head?.({
      loaderData: { mods: MODS, user: null, origin: ORIGIN },
    } as never)) as { scripts: Array<{ children: string }> }
    const faq = head.scripts
      .map((script) => JSON.parse(script.children))
      .find((node) => node['@type'] === 'FAQPage') as {
      mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }>
    }

    expect(faq.mainEntity.length).toBeGreaterThan(0)
    const pageText = container.textContent ?? ''
    for (const question of faq.mainEntity) {
      expect(screen.getByRole('heading', { level: 3, name: question.name })).toBeTruthy()
      expect(pageText).toContain(question.acceptedAnswer.text)
    }
  })

  it('answers what a mod is, how to install one here and by hand, and whether mods are safe', () => {
    renderPage(MODS)

    for (const question of [
      'What is a Claude Code mod?',
      'How do I install a mod from statuslin.es?',
      'How do I install a mod by hand?',
      'Are Claude Code mods safe?',
    ]) {
      expect(screen.getByRole('heading', { level: 3, name: question }), question).toBeTruthy()
    }
  })

  it('gives the two commands a mod install runs, for this site', () => {
    const { container } = renderPage(MODS)

    const pageText = container.textContent ?? ''
    expect(pageText).toContain(`claude plugin marketplace add ${ORIGIN}/marketplace.json`)
    expect(pageText).toContain('claude plugin install <mod>@statuslines')
  })

  it('links the safety guide once, from the intro', () => {
    renderPage(MODS)

    const links = screen.getAllByRole('link', { name: 'what a mod can touch' })
    expect(links).toHaveLength(1)
    expect(links[0]?.getAttribute('href')).toBe('/guide/are-claude-code-mods-safe')
    expect(screen.queryByRole('link', { name: 'Read the mod safety guide' })).toBeNull()
  })

  it('says so when no mod is published', () => {
    renderPage([])

    expect(screen.getByText('No mods are published yet.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Meter' })).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Common questions' })).toBeTruthy()
  })
})
