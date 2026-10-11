// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { coerceGalleryFilter } from '@/gallery/gallery-items'
import { modJsonLd } from '@/lib/breadcrumb-json-ld'
import { jsonLdScript } from '@/lib/json-ld'
import { MOD_NOT_FOUND_TITLE, modMetaDescription, modPageTitle } from '@/lib/page-title'
import type { ModDetail } from '@/mods/queries'
import { CARD_HEIGHT, CARD_WIDTH } from '@/og/dimensions'

const recordModCopyFn = vi.hoisted(() => vi.fn())
vi.mock('@/mods/functions', () => ({ recordModCopyFn, getModDetailFn: vi.fn() }))
vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ get_distinct_id: () => 'did-test', get_session_id: () => 'sid-test' }),
}))
vi.mock('@/ui/shell', () => ({
  PageShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@tanstack/react-router', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    Link: ({
      to,
      search,
      children,
    }: {
      to: string
      search?: Record<string, string>
      children: ReactNode
    }) => <a href={search ? `${to}?${new URLSearchParams(search)}` : to}>{children}</a>,
  }
})

const { Route: ModRoute } = await import('@/routes/mods.$slug')

const ORIGIN = 'https://site.example.test'
const SHA = '0123456789abcdef0123456789abcdef01234567'

const MOD: ModDetail = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'filetree',
  pluginName: 'filetree',
  title: 'File Tree',
  description: 'A file tree pane.',
  authorGithub: 'octocat',
  repoUrl: 'https://github.com/octocat/mods',
  path: 'plugins/filetree',
  commitSha: SHA,
  license: 'MIT',
  footprint: {
    events: ['ui.render{component=Pane, requestId=filetree}', 'command.run{command=filetree}'],
    calls: ['$.fs.read', '$.ui.toast', '$.warp.drive'],
  },
  preview: [{ text: 'src/\n  app.ts' }],
  desktop: null,
  generatedContent: null,
}

const COPY: NonNullable<ModDetail['generatedContent']> = {
  summary: 'A file tree of the current folder in a pane.',
  howItWorks: ['Run `/filetree` to open it', 'Folders open on click'],
  goodToKnow: [],
  details: { showsUp: 'A file tree pane on the right' },
}

function renderPage(mod: Partial<ModDetail> = {}) {
  vi.spyOn(ModRoute, 'useLoaderData').mockReturnValue({
    mod: { ...MOD, ...mod },
    user: null,
    origin: ORIGIN,
  })
  const Page = ModRoute.options.component
  return render(Page ? <Page /> : null)
}

const writeText = vi.fn<(text: string) => Promise<void>>()

beforeEach(() => {
  writeText.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  recordModCopyFn.mockResolvedValue(4)
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('mod page head', () => {
  function head(mod: ModDetail | undefined) {
    const loaderData = mod ? { mod, user: null, origin: ORIGIN } : undefined
    return ModRoute.options.head?.({ loaderData } as never) as {
      meta: Array<Record<string, string>>
      scripts?: Array<{ type: string; children: string }>
    }
  }

  it('emits the breadcrumb as JSON-LD on the site origin', () => {
    expect(head(MOD).scripts).toEqual(modJsonLd(ORIGIN, MOD).map(jsonLdScript))
    expect(head(MOD).scripts?.[0]?.children).toContain(`${ORIGIN}/?kind=mods`)
  })

  it('titles and describes the mod through the page-title helpers', () => {
    const long = { ...MOD, description: `A file tree pane ${'with details '.repeat(20)}` }

    expect(head(long).meta.slice(0, 2)).toEqual([
      { title: modPageTitle(MOD.title) },
      { name: 'description', content: modMetaDescription(long.description) },
    ])
    expect(modMetaDescription(long.description).length).toBeLessThanOrEqual(160)
  })

  it('points og:image and twitter:image at the mod card on the site origin', () => {
    const image = `${ORIGIN}/og/mods/filetree.png`

    expect(head(MOD).meta.slice(2)).toEqual([
      { property: 'og:image', content: image },
      { property: 'og:image:width', content: String(CARD_WIDTH) },
      { property: 'og:image:height', content: String(CARD_HEIGHT) },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: image },
    ])
  })

  it('titles a missing mod as not found', () => {
    expect(head(undefined).meta).toEqual([{ title: MOD_NOT_FOUND_TITLE }])
  })
})

const SHOT = {
  kind: 'shot' as const,
  shot: { src: '/mod-previews/v1/desktop.png?r=1', width: 790, height: 520 },
  card: { src: '/mod-previews/v1/desktop.png?r=1&image=card', width: 790, height: 52 },
}

/** The card holding the section whose h2 is `title`. */
function section(title: string) {
  const heading = screen.getByRole('heading', { level: 2, name: title })
  const card = heading.closest('[data-slot="card"]')
  if (!(card instanceof HTMLElement)) throw new Error(`no card around ${title}`)
  return within(card)
}

describe('mod page', () => {
  it('breadcrumbs home › Mods › the mod, linking Mods to the mods-filtered gallery', () => {
    renderPage()

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav.textContent).toBe('Status lines›Mods›File Tree')
    const mods = within(nav).getByRole('link', { name: 'Mods' })
    const url = new URL(mods.getAttribute('href') ?? '', ORIGIN)
    expect(url.pathname).toBe('/')
    expect(coerceGalleryFilter(url.searchParams.get('kind'))).toBe('mods')
  })

  it('runs header, install, preview, then what it does, like a status line page', () => {
    renderPage({ generatedContent: COPY })

    const order = [
      screen.getByRole('heading', { level: 1, name: 'File Tree' }),
      screen.getByRole('heading', { level: 2, name: 'Install' }),
      screen.getByRole('heading', { level: 2, name: 'Preview' }),
      screen.getByRole('heading', { level: 2, name: 'What it does' }),
    ]
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Install',
      'Preview',
      'What it does',
    ])
    for (let i = 1; i < order.length; i++) {
      const earlier = order[i - 1] as Node
      expect(
        earlier.compareDocumentPosition(order[i] as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    }
  })

  it('puts the breadcrumb above the title, like a status line page', () => {
    renderPage()

    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' })
    const title = screen.getByRole('heading', { level: 1, name: 'File Tree' })
    expect(
      breadcrumb.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('puts the byline under the title and above the description, like a status line page', () => {
    renderPage()

    const byline = screen.getByText('by')
    const description = screen.getByText('A file tree pane.')
    expect(
      byline.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('separates the byline facts with a dot that starts each later fact', () => {
    renderPage()

    const dots = screen.getAllByText('·')
    expect(dots).toHaveLength(2)
    expect(dots[0]?.parentElement?.textContent).toMatch(/^·\s*source at/)
    expect(dots[1]?.parentElement?.textContent).toMatch(/^·\s*MIT licence/)
  })

  it('credits the author with their GitHub avatar', () => {
    renderPage()

    expect(
      document.querySelector('img[src="https://avatars.githubusercontent.com/octocat?s=40"]'),
    ).toBeTruthy()
  })

  it('renders the labelled terminal preview, rows and all, and no Desktop slot without a result', () => {
    renderPage()

    const preview = section('Preview')
    expect(preview.getByText('Terminal')).toBeTruthy()
    expect(preview.getByText(/src\/\s+app\.ts/)).toBeTruthy()
    expect(preview.queryByText('Claude Desktop')).toBeNull()
  })

  it('says so when the mod draws nothing in the terminal', () => {
    renderPage({ preview: [] })

    expect(section('Preview').getByText('Draws nothing in the terminal.')).toBeTruthy()
    expect(screen.queryByText('No preview available.')).toBeNull()
  })

  it('stacks the Desktop shot under the terminal, whole and at its CSS size', () => {
    renderPage({ desktop: SHOT })

    const preview = section('Preview')
    const terminal = preview.getByText('Terminal')
    const desktop = preview.getByText('Claude Desktop')
    const image = preview.getByRole('img', { name: 'File Tree in Claude Desktop' })
    expect(image.getAttribute('src')).toBe(SHOT.shot.src)
    expect(image.getAttribute('width')).toBe('790')
    expect(image.getAttribute('height')).toBe('520')
    expect(
      terminal.compareDocumentPosition(desktop) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('says so when the mod draws nothing in Claude Desktop', () => {
    renderPage({ desktop: { kind: 'nothing' } })

    const preview = section('Preview')
    expect(preview.getByText('Claude Desktop')).toBeTruthy()
    expect(preview.getByText('Draws nothing in Claude Desktop.')).toBeTruthy()
    expect(preview.queryByRole('img')).toBeNull()
  })

  it('shows only the Desktop shot when the terminal has no result yet', () => {
    renderPage({ preview: null, desktop: SHOT })

    const preview = section('Preview')
    expect(preview.queryByText('Terminal')).toBeNull()
    expect(preview.getByRole('img', { name: 'File Tree in Claude Desktop' })).toBeTruthy()
  })

  it('says there is no preview when neither surface has a result', () => {
    renderPage({ preview: null, desktop: null })

    expect(section('Preview').getByText('No preview available.')).toBeTruthy()
  })

  it('shows both install commands against the site origin', () => {
    renderPage()

    expect(
      screen.getByText(`/plugin install filetree --marketplace ${ORIGIN}/marketplace.json`),
    ).toBeTruthy()
    expect(
      screen.getByText(`claude plugin install filetree --marketplace ${ORIGIN}/marketplace.json`),
    ).toBeTruthy()
  })

  it.each([
    ['In a Claude Code session', 'session', '/plugin install'],
    ['From a shell', 'shell', 'claude plugin install'],
  ] as const)('copying the "%s" command copies it and records the copy', async (label, kind, prefix) => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: `Copy command: ${label}` }))

    await waitFor(() => expect(recordModCopyFn).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0]?.[0]).toMatch(new RegExp(`^${prefix} filetree `))
    expect(recordModCopyFn).toHaveBeenCalledWith({
      data: { modId: MOD.id, kind, distinctId: 'did-test', sessionId: 'sid-test' },
    })
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeTruthy()
  })

  it.each([
    'In a Claude Code session',
    'From a shell',
  ])('makes the "%s" copy button the primary, large call to action', (label) => {
    renderPage()

    const button = screen.getByRole('button', { name: `Copy command: ${label}` })
    expect(button.dataset.variant).toBe('default')
    expect(button.dataset.size).toBe('lg')
  })

  it('states the footprint’s facts as tiles in What it does', () => {
    renderPage()

    const what = section('What it does')
    const tile = (label: string) => what.getByText(label).closest('dt')?.nextElementSibling
    expect(tile('Shows up')?.textContent).toBe('A pane and a toast')
    expect(tile('Works in')?.textContent).toBe('Terminal')
    expect(tile('Commands')?.textContent).toBe('/filetree')
    expect(tile('Uses your plan')?.textContent).toBe('No')
    expect(tile('Changes files')?.textContent).toBe('Nothing')
    expect(tile('Network')?.textContent).toBe('None')
  })

  it('credits the author with a link to the source at the pinned commit', () => {
    renderPage()

    const link = screen.getByRole('link', { name: '0123456' })
    expect(link.getAttribute('href')).toBe(
      `https://github.com/octocat/mods/tree/${SHA}/plugins/filetree`,
    )
    expect(screen.getByRole('link', { name: /@octocat/ }).getAttribute('href')).toBe(
      'https://github.com/octocat',
    )
    expect(screen.getByText('MIT licence')).toBeTruthy()
  })

  it('links a root-level plugin to the repo tree at the commit', () => {
    renderPage({ path: '' })

    expect(screen.getByRole('link', { name: '0123456' }).getAttribute('href')).toBe(
      `https://github.com/octocat/mods/tree/${SHA}`,
    )
  })

  it('renders the page copy in What it does when the version has it', () => {
    renderPage({ generatedContent: COPY })

    const what = section('What it does')
    expect(what.getByText(COPY.summary)).toBeTruthy()
    expect(what.getByRole('heading', { level: 3, name: 'How it works' })).toBeTruthy()
    expect(what.getByText('Folders open on click')).toBeTruthy()
    expect(what.getByText('A file tree pane on the right')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Good to know' })).toBeNull()
  })

  it('still states the facts, with no page copy, when the version has none', () => {
    renderPage()

    expect(section('What it does').getByText('Shows up')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'How it works' })).toBeNull()
  })

  it('says so when there is no licence', () => {
    renderPage({ license: null })

    expect(screen.getByText('No licence')).toBeTruthy()
  })
})
