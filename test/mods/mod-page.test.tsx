// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MOD_NOT_FOUND_TITLE, modMetaDescription, modPageTitle } from '@/lib/page-title'
import type { ModDetail } from '@/mods/queries'

const recordModCopyFn = vi.hoisted(() => vi.fn())
vi.mock('@/mods/functions', () => ({ recordModCopyFn, getModDetailFn: vi.fn() }))
vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ get_distinct_id: () => 'did-test', get_session_id: () => 'sid-test' }),
}))
vi.mock('@/ui/shell', () => ({
  PageShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

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
  desktopScreenshot: null,
  preview: [{ text: 'src/\n  app.ts' }],
  generatedContent: null,
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
    }
  }

  it('titles and describes the mod through the page-title helpers', () => {
    const long = { ...MOD, description: `A file tree pane ${'with details '.repeat(20)}` }

    expect(head(long).meta).toEqual([
      { title: modPageTitle(MOD.title) },
      { name: 'description', content: modMetaDescription(long.description) },
    ])
    expect(modMetaDescription(long.description).length).toBeLessThanOrEqual(160)
  })

  it('titles a missing mod as not found', () => {
    expect(head(undefined).meta).toEqual([{ title: MOD_NOT_FOUND_TITLE }])
  })
})

describe('mod page', () => {
  it('renders the terminal preview, rows and all', () => {
    renderPage()

    expect(screen.getByText(/src\/\s+app\.ts/)).toBeTruthy()
    expect(screen.queryByText('Claude Desktop, screenshot')).toBeNull()
  })

  it('shows the labelled Desktop screenshot when that is all the version has', () => {
    renderPage({ preview: null, desktopScreenshot: '/mods/screenshots/anywhere.png' })

    const image = screen.getByRole('img', { name: /File Tree in Claude Desktop/ })
    expect(image.getAttribute('src')).toBe('/mods/screenshots/anywhere.png')
    expect(image.getAttribute('width')).toMatch(/^\d+$/)
    expect(image.getAttribute('height')).toMatch(/^\d+$/)
    const figure = screen.getByRole('figure')
    expect(image.parentElement).toBe(figure)
    expect(figure.querySelector(':scope > figcaption')?.textContent).toBe(
      'Claude Desktop, screenshot',
    )
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

  it('describes the footprint in plain words, keeping an unknown entry verbatim', () => {
    renderPage()

    expect(screen.getByText('reads files')).toBeTruthy()
    expect(screen.getByText('adds the /filetree command')).toBeTruthy()
    expect(screen.getByText('$.warp.drive')).toBeTruthy()
    expect(screen.getByText('a pane')).toBeTruthy()
    expect(screen.getByText('a toast')).toBeTruthy()
    expect(screen.getByText('Terminal')).toBeTruthy()
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

  it('renders the generated page copy when the version has it', () => {
    renderPage({
      generatedContent: {
        whatItShows: ['The files in the current folder'],
        requirements: [],
        behaviorNotes: ['Folders open on click'],
      },
    })

    expect(screen.getByRole('heading', { level: 2, name: 'What it shows' })).toBeTruthy()
    expect(screen.getByText('The files in the current folder')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Behavior notes' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Requirements' })).toBeNull()
  })

  it('renders no generated copy when the version has none', () => {
    renderPage()

    expect(screen.queryByRole('heading', { name: 'What it shows' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Behavior notes' })).toBeNull()
  })

  it('says so when there is no licence', () => {
    renderPage({ license: null })

    expect(screen.getByText('No licence')).toBeTruthy()
  })
})
