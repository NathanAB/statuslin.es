// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BUDDY_FAQ } from '@/guide/buddy-faq'
import { MOD_SAFETY_GUIDE_PATH } from '@/lib/page-title'
import { MOD_INSTALL_MIN_VERSION } from '@/mods/install'
import type { ModDetail } from '@/mods/queries'

vi.mock('@/mods/functions', () => ({ recordModCopyFn: vi.fn() }))
vi.mock('sonner', () => ({ toast: vi.fn() }))
vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: vi.fn(), get_distinct_id: () => 'd', get_session_id: () => 's' }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
  }: {
    to: string
    params?: Record<string, string>
    children: ReactNode
  }) => <a href={params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to}>{children}</a>,
}))

const { BuddyGuideContent } = await import('@/guide/buddy-guide-content')

const ORIGIN = 'https://site.example.test'
const ISSUE_URL = 'https://github.com/anthropics/claude-code/issues/45596'

function pet(slug: string, title: string, overrides: Partial<ModDetail> = {}): ModDetail {
  return {
    id: `11111111-1111-4111-8111-${slug.padStart(12, '0').slice(-12)}`,
    slug,
    pluginName: slug,
    title,
    description: `${title} lives above the prompt.`,
    authorGithub: 'octocat',
    repoUrl: `https://github.com/octocat/${slug}`,
    path: '',
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    license: 'MIT',
    footprint: {
      events: ['ui.render{component=AbovePrompt}', `command.run{command=${slug}}`],
      calls: ['$.store.set'],
    },
    preview: [{ text: `${title} preview` }],
    desktop: null,
    generatedContent: null,
    copyCount: 0,
    tags: [],
    updatedAt: '2026-10-17',
    recordedWith: '2.1.296',
    reviewedAt: null,
    ...overrides,
  }
}

const FAMILIAR = pet('familiar', 'Familiar', {
  generatedContent: {
    summary: 'A pixel companion above the prompt that reacts to your session.',
    howItWorks: [],
    goodToKnow: [],
    details: {},
  },
})
const CAT = pet('pixel-cat', 'Pixel Cat')

describe('BuddyGuideContent', () => {
  it('says buddy was removed, links the Bring Back Buddy issue, and that these pets are not buddy', () => {
    render(<BuddyGuideContent pets={[FAMILIAR]} origin={ORIGIN} />)

    expect(screen.getByRole('heading', { level: 1, name: /buddy/i })).toBeTruthy()
    const issue = screen.getByRole('link', { name: /#45596/ }) as HTMLAnchorElement
    expect(issue.href).toBe(ISSUE_URL)
    expect(document.body.textContent).toMatch(/2\.1\.97/)
    expect(document.body.textContent).toMatch(/none of them is buddy/i)
    expect(document.body.textContent).toContain(`Claude Code ${MOD_INSTALL_MIN_VERSION} or later`)
  })

  it('gives each pet its own section, in order, with its page link, summary and preview', () => {
    render(<BuddyGuideContent pets={[FAMILIAR, CAT]} origin={ORIGIN} />)

    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles.slice(0, 2)).toEqual(['Familiar', 'Pixel Cat'])
    const familiar = screen.getByRole('region', { name: 'Familiar' })
    const link = within(familiar).getByRole('link', { name: 'Familiar' }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/mods/familiar')
    // The reviewed page summary when there is one, the author's description otherwise.
    expect(familiar.textContent).toContain(FAMILIAR.generatedContent?.summary)
    expect(familiar.textContent).toContain('Familiar preview')
    const cat = screen.getByRole('region', { name: 'Pixel Cat' })
    expect(cat.textContent).toContain('Pixel Cat lives above the prompt.')
  })

  it("shows each pet's reach from its footprint and its counted install prompt", () => {
    render(<BuddyGuideContent pets={[FAMILIAR]} origin={ORIGIN} />)

    const familiar = screen.getByRole('region', { name: 'Familiar' })
    for (const label of ['What you see', 'Uses your tokens', 'Changes files', 'Network access']) {
      expect(familiar.textContent).toContain(label)
    }
    expect(familiar.textContent).toContain('/familiar')
    expect(
      within(familiar).getByRole('button', { name: 'Copy install prompt for Familiar' }),
    ).toBeTruthy()
  })

  it('warns when two pets add the same slash command', () => {
    const pets = [pet('pets', 'Claude Pets'), pet('pixipet', 'Pixipet'), CAT].map((p, i) =>
      i < 2 ? { ...p, footprint: { events: ['command.run{command=pet}'], calls: [] } } : p,
    )
    render(<BuddyGuideContent pets={pets} origin={ORIGIN} />)

    expect(document.body.textContent).toMatch(/Claude Pets and Pixipet both add \/pet/)
  })

  it('says no pet is listed yet when none is published, and adds no warning', () => {
    render(<BuddyGuideContent pets={[]} origin={ORIGIN} />)

    expect(screen.queryAllByRole('region')).toEqual([])
    expect(document.body.textContent).toMatch(/no pet mods are published yet/i)
    expect(document.body.textContent).not.toMatch(/both add|all add/)
  })

  it('points to the mod safety guide and asks its common questions', () => {
    render(<BuddyGuideContent pets={[FAMILIAR]} origin={ORIGIN} />)

    expect(
      screen.getAllByRole('link').some((a) => a.getAttribute('href') === MOD_SAFETY_GUIDE_PATH),
    ).toBe(true)
    expect(screen.getByRole('heading', { level: 2, name: /common questions/i })).toBeTruthy()
    for (const entry of BUDDY_FAQ) {
      expect(screen.getByRole('heading', { level: 3, name: entry.question })).toBeTruthy()
    }
  })
})
