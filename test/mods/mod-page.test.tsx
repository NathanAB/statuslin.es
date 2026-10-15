// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GalleryItem } from '@/gallery/gallery-items'
import {
  HOME_TITLE_BASE,
  MOD_NOT_FOUND_TITLE,
  modMetaDescription,
  modPageTitle,
} from '@/lib/page-title'
import { MOD_INSTALL_MIN_VERSION, modInstallPrompt } from '@/mods/install'
import type { ModDetail } from '@/mods/queries'

const recordModCopyFn = vi.hoisted(() => vi.fn())
vi.mock('@/mods/functions', () => ({ recordModCopyFn, getModDetailFn: vi.fn() }))
const toast = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast }))
const capture = vi.hoisted(() => vi.fn())
vi.mock('@posthog/react', () => ({
  usePostHog: () => ({
    capture,
    get_distinct_id: () => 'did-test',
    get_session_id: () => 'sid-test',
  }),
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
      params,
      search,
      children,
      onClick,
    }: {
      to: string
      params?: Record<string, string>
      search?: Record<string, string>
      children: ReactNode
      onClick?: () => void
    }) => {
      const path = params ? to.replace(/\$(\w+)/g, (_, key: string) => params[key] ?? '') : to
      return (
        <a href={search ? `${path}?${new URLSearchParams(search)}` : path} onClick={onClick}>
          {children}
        </a>
      )
    },
  }
})

const { Route: ModRoute } = await import('@/routes/mods.$slug')

const ORIGIN = 'https://site.example.test'
const PROMPT_BUTTON = 'Copy install prompt — File Tree'
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
  copyCount: 0,
  tags: [],
  updatedAt: '2026-09-30',
}

const COPY: NonNullable<ModDetail['generatedContent']> = {
  summary: 'A file tree of the current folder in a pane.',
  howItWorks: ['Run `/filetree` to open it', 'Folders open on click'],
  goodToKnow: [],
  details: { showsUp: 'A file tree pane on the right' },
}

const RELATED: GalleryItem[] = [
  {
    kind: 'mod',
    card: {
      modId: '22222222-2222-4222-8222-222222222222',
      slug: 'meter',
      title: 'Meter',
      description: 'A cost meter.',
      authorGithub: 'octocat',
      copyCount: 2,
      tags: [],
      preview: [{ text: 'meter' }],
      desktopShot: null,
    },
  },
  {
    kind: 'status-line',
    card: {
      configId: '33333333-3333-4333-8333-333333333333',
      slug: 'cost-bar',
      title: 'Cost Bar',
      description: 'Session cost.',
      interpreter: 'bash',
      copyCount: 5,
      author: null,
      preview: [{ text: '$1.20' }],
      networkHosts: [],
      readsClaudeToken: false,
      tags: [],
    },
  },
]

function renderPage(mod: Partial<ModDetail> & { related?: GalleryItem[] } = {}) {
  vi.spyOn(ModRoute, 'useLoaderData').mockReturnValue({
    mod: { ...MOD, related: [], ...mod },
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

  const jsonLd = (mod: ModDetail) =>
    (head(mod).scripts ?? []).map(
      (script) => JSON.parse(script.children) as Record<string, unknown>,
    )

  it('emits the mod as source code and its breadcrumb as JSON-LD on the site origin', () => {
    const nodes = jsonLd(MOD)

    expect(nodes.map((node) => node['@type'])).toEqual(['SoftwareSourceCode', 'BreadcrumbList'])
    expect(nodes[0]).toMatchObject({
      url: `${ORIGIN}/mods/filetree`,
      codeRepository: `https://github.com/octocat/mods/tree/${SHA}/plugins/filetree`,
    })
    expect(JSON.stringify(nodes[1])).toContain(`"item":"${ORIGIN}/mods"`)
  })

  it('adds a FAQPage when the version has page copy', () => {
    expect(jsonLd({ ...MOD, generatedContent: COPY }).map((node) => node['@type'])).toEqual([
      'SoftwareSourceCode',
      'BreadcrumbList',
      'FAQPage',
    ])
  })

  it('titles and describes the mod through the page-title helpers', () => {
    const long = { ...MOD, description: `A file tree pane ${'with details '.repeat(20)}` }

    expect(head(long).meta.slice(0, 2)).toEqual([
      { title: modPageTitle(MOD.title) },
      { name: 'description', content: modMetaDescription(long.description) },
    ])
    expect(modMetaDescription(long.description).length).toBeLessThanOrEqual(160)
  })

  it('shares the mod under its own url, title and description, not the home page', () => {
    const meta = head(MOD).meta
    const og = (property: string) => meta.find((m) => m.property === property)?.content

    expect(og('og:url')).toBe(`${ORIGIN}/mods/filetree`)
    expect(og('og:title')).toBe(modPageTitle(MOD.title))
    expect(og('og:title')).not.toBe(HOME_TITLE_BASE)
    expect(og('og:description')).toBe(modMetaDescription(MOD.description))
    expect(og('og:image')).toBe(`${ORIGIN}/og/mods/filetree.png`)
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
  it('breadcrumbs home › Mods › the mod, linking Mods to the mods page', () => {
    renderPage()

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav.textContent).toBe('Status lines›Mods›File Tree')
    expect(within(nav).getByRole('link', { name: 'Mods' }).getAttribute('href')).toBe('/mods')
  })

  it('runs header, install, preview, then what it does, like a status line page', () => {
    renderPage({ generatedContent: COPY })

    const order = [
      screen.getByRole('heading', { level: 1, name: 'File Tree' }),
      screen.getByRole('button', { name: PROMPT_BUTTON }),
      screen.getByRole('heading', { level: 2, name: 'Preview' }),
      screen.getByRole('heading', { level: 2, name: 'What it does' }),
    ]
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
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

  it('shows the mod’s tag chips in the header, like a status line page', () => {
    renderPage({ tags: ['cost'] })

    const title = screen.getByRole('heading', { level: 1, name: 'File Tree' })
    const chip = screen.getByRole('link', { name: 'Cost' })
    expect(title.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      chip.compareDocumentPosition(screen.getByRole('button', { name: PROMPT_BUTTON })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('installs by the mod slug, the marketplace entry name, not the plugin name', async () => {
    renderPage({ slug: 'filetree-ada', pluginName: 'filetree' })

    fireEvent.click(screen.getByRole('button', { name: PROMPT_BUTTON }))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0]?.[0]).toBe(modInstallPrompt(ORIGIN, 'filetree-ada'))
    expect(writeText.mock.calls[0]?.[0]).toContain('plugin install filetree-ada@statuslines')
  })

  it('copies the install prompt from one primary button, like a status line page', async () => {
    renderPage()

    const button = screen.getByRole('button', { name: PROMPT_BUTTON })
    expect(button.dataset.variant).toBe('default')
    expect(button.textContent).toBe('Copy install prompt')
    fireEvent.click(button)

    await waitFor(() => expect(recordModCopyFn).toHaveBeenCalledTimes(1))
    expect(writeText).toHaveBeenCalledWith(modInstallPrompt(ORIGIN, 'filetree'))
    expect(recordModCopyFn).toHaveBeenCalledWith({
      data: { modId: MOD.id, kind: 'prompt', distinctId: 'did-test', sessionId: 'sid-test' },
    })
    expect(toast).toHaveBeenCalledWith('Prompt copied', {
      description: `Paste it into Claude Code ${MOD_INSTALL_MIN_VERSION} or later to install this mod.`,
    })
  })

  it('shows the copy count beside the button and counts a copy, like a status line page', async () => {
    recordModCopyFn.mockResolvedValue(4)
    renderPage({ copyCount: 3 })

    expect(screen.getByText('3 copies')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: PROMPT_BUTTON }))

    expect(await screen.findByText('4 copies')).toBeTruthy()
  })

  it('shows the install commands as text under the button, run with plain claude', () => {
    renderPage({ slug: 'filetree-ada' })

    const button = screen.getByRole('button', { name: PROMPT_BUTTON })
    const lead = screen.getByText('Or run it yourself:')
    const commands = screen.getByText(/plugin install filetree-ada@statuslines/)
    expect(commands.textContent).toBe(
      [
        `claude plugin marketplace add ${ORIGIN}/marketplace.json`,
        'claude plugin install filetree-ada@statuslines',
      ].join('\n'),
    )
    expect(button.compareDocumentPosition(lead) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(lead.compareDocumentPosition(commands) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows only the button and its count: no install heading or app links', () => {
    renderPage()

    expect(screen.queryByRole('heading', { name: 'Install' })).toBeNull()
    expect(document.querySelector('a[href^="claude"]')).toBeNull()
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

  it('ends with more like this: related mods, then status lines, each linking to its page', () => {
    renderPage({ generatedContent: COPY, related: RELATED })

    const what = screen.getByRole('heading', { level: 2, name: 'What it does' })
    const more = screen.getByRole('heading', { level: 2, name: 'More like this' })
    expect(what.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const links = section('More like this')
      .getAllByRole('link')
      .filter((link) => ['Meter', 'Cost Bar'].includes(link.textContent ?? ''))
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Meter', '/mods/meter'],
      ['Cost Bar', '/c/cost-bar'],
    ])
  })

  it('has no more like this section when nothing shares a tag', () => {
    renderPage({ related: [] })

    expect(screen.queryByRole('heading', { name: 'More like this' })).toBeNull()
  })

  it('says so when there is no licence', () => {
    renderPage({ license: null })

    expect(screen.getByText('No licence')).toBeTruthy()
  })
})

describe('mod page analytics', () => {
  it('captures the view of the mod page', () => {
    renderPage()

    expect(capture).toHaveBeenCalledWith('mod_detail_viewed', { modId: MOD.id, slug: 'filetree' })
  })

  it('captures clicks on more like this as related cards, by position', () => {
    renderPage({ related: RELATED })

    fireEvent.click(screen.getByRole('link', { name: 'Meter' }))
    fireEvent.click(screen.getByRole('link', { name: 'Cost Bar' }))

    expect(capture).toHaveBeenCalledWith('mod_card_clicked', {
      modId: '22222222-2222-4222-8222-222222222222',
      slug: 'meter',
      surface: 'related',
      position: 1,
    })
    expect(capture).toHaveBeenCalledWith('statusline_card_clicked', {
      configId: '33333333-3333-4333-8333-333333333333',
      slug: 'cost-bar',
      surface: 'related',
      position: 2,
    })
  })
})
