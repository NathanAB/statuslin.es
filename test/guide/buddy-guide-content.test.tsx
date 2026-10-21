// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { GalleryModCard } from '@/gallery/gallery-items'
import { BUDDY_FAQ } from '@/guide/buddy-faq'
import { MOD_SAFETY_GUIDE_PATH } from '@/lib/page-title'
import { MOD_INSTALL_MIN_VERSION } from '@/mods/install'

const capture = vi.hoisted(() => vi.fn())
vi.mock('@posthog/react', () => ({ usePostHog: () => ({ capture }) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    onClick,
  }: {
    to: string
    params?: Record<string, string>
    children: ReactNode
    onClick?: () => void
  }) => (
    <a
      href={params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to}
      onClick={(event) => {
        event.preventDefault()
        onClick?.()
      }}
    >
      {children}
    </a>
  ),
}))

const { BuddyGuideContent } = await import('@/guide/buddy-guide-content')

const ISSUE_URL = 'https://github.com/anthropics/claude-code/issues/45596'

function card(slug: string, title: string): GalleryModCard {
  return {
    modId: `11111111-1111-4111-8111-${slug.padStart(12, '0').slice(-12)}`,
    slug,
    title,
    description: `${title} lives above the prompt.`,
    authorGithub: 'octocat',
    copyCount: 0,
    tags: [],
    preview: [{ text: `${title} preview` }],
    desktopShot: null,
  }
}

const PIXIPET = card('pixipet', 'Pixipet')
const CAT = card('pixel-cat', 'Pixel Cat')

describe('BuddyGuideContent', () => {
  // The changelog records /buddy arriving (2.1.89) but not leaving, so the page reports what users
  // say rather than stating a removal as fact.
  it('says users report buddy gone, links the Bring Back Buddy issue, and that these are new pets', () => {
    render(<BuddyGuideContent cards={[PIXIPET]} clashes={[]} />)

    expect(screen.getByRole('heading', { level: 1, name: /buddy/i })).toBeTruthy()
    const issue = screen.getByRole('link', {
      name: 'Bring Back Buddy, #45596',
    }) as HTMLAnchorElement
    expect(issue.href).toBe(ISSUE_URL)
    const text = document.body.textContent ?? ''
    expect(text).toContain('Users report it gone since 2.1.97')
    expect(text).not.toMatch(/2\.1\.97 removed/)
    expect(text).toContain("They're new pets, not your old buddy.")
    expect(text).toContain(`Mods need Claude Code ${MOD_INSTALL_MIN_VERSION} or later.`)
    expect(
      screen.getAllByRole('link').some((a) => a.getAttribute('href') === MOD_SAFETY_GUIDE_PATH),
    ).toBe(true)
  })

  it('lists each pet as a gallery card linking to its mod page, in order, with no install controls', () => {
    render(<BuddyGuideContent cards={[PIXIPET, CAT]} clashes={[]} />)

    const titles = ['Pixipet', 'Pixel Cat'].map(
      (name) => screen.getByRole('link', { name }) as HTMLAnchorElement,
    )
    expect(titles.map((a) => a.getAttribute('href'))).toEqual(['/mods/pixipet', '/mods/pixel-cat'])
    expect(titles[0]?.compareDocumentPosition(titles[1] as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(document.body.textContent).toContain('Pixipet preview')
    // The previews, fact tiles and install prompt live on each mod page now.
    expect(screen.queryByRole('button', { name: /copy install prompt/i })).toBeNull()
    for (const tile of ['Changes files', 'Preview recorded with', 'Reviewed commit']) {
      expect(document.body.textContent).not.toContain(tile)
    }
  })

  it('counts card clicks under their own surface, with the position on the page', () => {
    capture.mockClear()
    render(<BuddyGuideContent cards={[PIXIPET, CAT]} clashes={[]} />)

    fireEvent.click(screen.getByRole('link', { name: 'Pixel Cat' }))

    expect(capture).toHaveBeenCalledWith('mod_card_clicked', {
      modId: CAT.modId,
      slug: 'pixel-cat',
      surface: 'buddy_guide',
      position: 2,
    })
  })

  it('puts a note above the cards for each command two or more pets add', () => {
    render(
      <BuddyGuideContent
        cards={[PIXIPET, CAT]}
        clashes={[
          { command: 'pet', titles: ['Pixipet', 'Claude Pets', 'Code Pet'] },
          { command: 'mods', titles: ['Pixel Cat', 'Pixipet'] },
        ]}
      />,
    )

    const notes = screen.getAllByText(/Install one\./)
    expect(notes.map((note) => note.closest('p')?.textContent)).toEqual([
      'Pixipet, Claude Pets, and Code Pet all add /pet. Install one.',
      'Pixel Cat and Pixipet both add /mods. Install one.',
    ])
    const firstCard = screen.getByRole('link', { name: 'Pixipet' })
    expect(notes[1]?.compareDocumentPosition(firstCard)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('says no pet is published yet, without cards or notes, when there are none', () => {
    render(<BuddyGuideContent cards={[]} clashes={[]} />)

    expect(document.body.textContent).toMatch(/no pet mods are published yet/i)
    expect(screen.queryByText(/Install one\./)).toBeNull()
  })

  it('keeps the submit link and asks its common questions', () => {
    render(<BuddyGuideContent cards={[PIXIPET]} clashes={[]} />)

    const submit = within(document.body).getByRole('link', { name: /submit your pet mod/i })
    expect(submit.getAttribute('href')).toBe('/submit')
    expect(screen.getByRole('heading', { level: 2, name: /common questions/i })).toBeTruthy()
    for (const entry of BUDDY_FAQ) {
      expect(screen.getByRole('heading', { level: 3, name: entry.question })).toBeTruthy()
    }
  })
})

describe('BUDDY_FAQ', () => {
  it('answers in one or two sentences, without repeating the /pet note', () => {
    for (const { answer } of BUDDY_FAQ) {
      expect(answer.split(/(?<=\.)\s+(?=[A-Z])/).length, answer).toBeLessThanOrEqual(2)
      expect(answer).not.toMatch(/install one|install only one/i)
    }
  })
})
