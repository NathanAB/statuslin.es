// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UnreviewedLookup, UnreviewedMod } from '@/mods/unreviewed-queries'

const getUnreviewedModFn = vi.hoisted(() => vi.fn())
vi.mock('@/mods/unreviewed-functions', () => ({ getUnreviewedModFn }))
vi.mock('@/lib/auth-functions', () => ({ getSession: async () => null }))
const capture = vi.hoisted(() => vi.fn())
const posthog = vi.hoisted(() => ({ capture }))
vi.mock('@posthog/react', () => ({ usePostHog: () => posthog }))
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

const { Route } = await import('@/routes/mods.unreviewed.$owner.$pluginName')

const ORIGIN = 'https://site.example.test'
const SHA = '0123456789abcdef0123456789abcdef01234567'

const MOD: UnreviewedMod = {
  owner: 'OctoCat',
  pluginName: 'meter',
  description: 'A token meter.',
  repoUrl: 'https://github.com/OctoCat/mods',
  path: 'plugins/meter',
  commitSha: SHA,
  committedAt: '2026-11-01T09:30:00.000Z',
  license: 'MIT',
  stars: 1234,
  footprint: {
    events: ['command.run{command=meter}', 'ui.render{component=AbovePrompt}'],
    calls: ['$.model.complete', '$.ui.toast'],
  },
  validatedWith: '2.1.296',
  checkedAt: '2026-11-12T08:00:00.000Z',
}

function renderPage(mod: Partial<UnreviewedMod> = {}) {
  vi.spyOn(Route, 'useLoaderData').mockReturnValue({ mod: { ...MOD, ...mod }, user: null })
  const Page = Route.options.component
  return render(Page ? <Page /> : null)
}

beforeEach(() => {
  vi.stubEnv('BETTER_AUTH_URL', ORIGIN)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  capture.mockClear()
})

describe('unreviewed mod page', () => {
  it('names the mod and credits its owner on GitHub', () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'meter' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '@OctoCat' }).getAttribute('href')).toBe(
      'https://github.com/OctoCat',
    )
    expect(screen.getByText('A token meter.')).toBeTruthy()
  })

  it('says nobody here read it, that it installs nothing here, and links how mods are checked', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'Not reviewed' })).toBeTruthy()
    const notice = screen.getByText(/Nobody at statuslin.es has read this code/)
    expect(notice.textContent).toContain("so it can't be installed from here")
    expect(
      within(notice)
        .getByRole('link', { name: 'how statuslin.es checks mods' })
        .getAttribute('href'),
    ).toBe('/how-it-works')
  })

  it('states what it can reach from the stored footprint alone', () => {
    renderPage()

    const tile = (label: string) => screen.getByText(label).closest('div')?.textContent
    expect(tile('Uses your tokens')).toBe('Uses your tokensYes')
    expect(tile('Network access')).toBe('Network accessNone')
    expect(tile('Slash commands')).toBe('Slash commands/meter')
  })

  it('lists the license, stars, commit date and repository, and when it was checked', () => {
    renderPage()

    expect(screen.getByText('MIT license')).toBeTruthy()
    expect(screen.getByText('1,234')).toBeTruthy()
    expect(screen.getByText('Nov 1, 2026')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'OctoCat/mods' }).getAttribute('href')).toBe(
      `https://github.com/OctoCat/mods/tree/${SHA}/plugins/meter`,
    )
    expect(screen.getByText(/^Checked at commit/).textContent).toBe(
      'Checked at commit 0123456 on Nov 12, 2026 with Claude Code 2.1.296.',
    )
  })

  it('says when a mod has no license', () => {
    renderPage({ license: null })

    expect(screen.getByText('No license')).toBeTruthy()
  })

  it('offers no install, no preview and no reviewed commit', () => {
    const { container } = renderPage()

    const text = container.textContent ?? ''
    expect(text).not.toMatch(/install prompt|claude plugin install|marketplace add/i)
    expect(text).not.toMatch(/reviewed commit|reviewed at commit|preview recorded/i)
    expect(screen.queryByRole('button', { name: /copy/i })).toBeNull()
  })

  it("shows the author's description as text, cut to its cap", () => {
    const hostile = `<img src=x onerror=alert(1)> ${'word '.repeat(100)}`
    const { container } = renderPage({ description: hostile })

    expect(container.querySelector('img[src="x"]')).toBeNull()
    const shown = screen.getByText(/^<img src=x/).textContent ?? ''
    expect(shown.length).toBeLessThanOrEqual(300)
    expect(shown.endsWith('…')).toBe(true)
  })

  it('sends one review request event, then thanks the visitor in a status already on the page', () => {
    renderPage()
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('')
    const button = screen.getByRole('button', { name: 'Request a review' })

    fireEvent.click(button)
    fireEvent.click(button)

    expect(capture.mock.calls).toEqual([
      ['unreviewed_mod_review_requested', { owner: 'OctoCat', pluginName: 'meter' }],
    ])
    expect(screen.getByRole('button', { name: 'Requested' })).toBe(button)
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('status')).toBe(status)
    expect(status.textContent).toBe('Thanks. Requests decide which mods are reviewed next.')
  })

  it("points the author at the mod submit page and the site's contact address", () => {
    renderPage()

    expect(screen.getByRole('link', { name: 'Submit it for review' }).getAttribute('href')).toBe(
      '/submit?kind=mod',
    )
    expect(screen.getByRole('link', { name: 'have it removed' }).getAttribute('href')).toBe(
      'mailto:hello@statuslin.es',
    )
  })
})

describe('unreviewed mod head', () => {
  function head(mod: Partial<UnreviewedMod> = {}) {
    return Route.options.head?.({
      loaderData: { mod: { ...MOD, ...mod }, user: null },
    } as never) as {
      meta: Array<Record<string, string>>
      links: Array<{ rel: string; href: string }>
      scripts?: unknown[]
    }
  }

  it('titles the page by name and owner and says it is not reviewed', () => {
    expect(head().meta).toContainEqual({
      title: 'meter by OctoCat: Claude Code mod (not reviewed)',
    })
  })

  it('is canonical to itself, with the owner as GitHub spells it', () => {
    const [canonical, ...rest] = head().links
    expect(rest).toEqual([])
    expect(canonical?.rel).toBe('canonical')
    expect(new URL(canonical?.href ?? '').pathname).toBe('/mods/unreviewed/OctoCat/meter')
  })

  it('stays indexable and carries no install JSON-LD', () => {
    const { meta, scripts } = head()

    expect(meta.some((tag) => tag.name === 'robots')).toBe(false)
    expect(scripts ?? []).toEqual([])
  })
})

describe('unreviewed mod loader', () => {
  const loader = Route.options.loader as unknown as (context: unknown) => Promise<unknown>
  const load = (owner: string, pluginName: string) => loader({ params: { owner, pluginName } })

  it('answers 404 for an owner and name with no page', async () => {
    getUnreviewedModFn.mockResolvedValue(null)

    await expect(load('octocat', 'nope')).rejects.toMatchObject({ isNotFound: true })
  })

  it('redirects permanently to the listing once the mod is reviewed', async () => {
    getUnreviewedModFn.mockResolvedValue({
      kind: 'reviewed',
      slug: 'token-meter',
    } satisfies UnreviewedLookup)

    const thrown = await Promise.resolve(load('octocat', 'meter')).catch((error: unknown) => error)

    expect(thrown).toBeInstanceOf(Response)
    expect((thrown as Response).status).toBe(301)
    expect(
      (thrown as { options: { href?: string; to?: string; params?: unknown } }).options,
    ).toMatchObject({
      to: '/mods/$slug',
      params: { slug: 'token-meter' },
    })
  })

  it('loads the page by the address it was asked for', async () => {
    getUnreviewedModFn.mockResolvedValue({ kind: 'page', mod: MOD } satisfies UnreviewedLookup)

    expect(await load('octocat', 'meter')).toEqual({ mod: MOD, user: null })
    expect(getUnreviewedModFn).toHaveBeenCalledWith({
      data: { owner: 'octocat', pluginName: 'meter' },
    })
  })
})
