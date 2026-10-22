// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HowItWorksExamples } from '@/how-it-works/examples'
import type { ModDetail } from '@/mods/queries'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, hash, children }: { to: string; hash?: string; children: React.ReactNode }) => (
    <a href={hash ? `${to}#${hash}` : to}>{children}</a>
  ),
}))

const { HowItWorksContent } = await import('@/how-it-works/how-it-works-content')

const SHA = '7d34049c1b2a3f4e5d6c7b8a9f0e1d2c3b4a5f6e'

const MOD: ModDetail = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'deck',
  pluginName: 'deck',
  title: 'Deck',
  description: 'A cockpit for Claude Code.',
  authorGithub: 'octocat',
  repoUrl: 'https://github.com/octocat/deck',
  path: '',
  commitSha: SHA,
  license: 'MIT',
  footprint: { events: ['ui.render{component=Band}'], calls: ['$.http.fetch'] },
  preview: [{ text: 'deck band' }],
  desktop: null,
  generatedContent: null,
  copyCount: 3,
  tags: [],
  updatedAt: '2026-10-15',
  recordedWith: '2.1.0',
  reviewedAt: '2026-10-15',
}

const ENTRY = `{\n  "name": "deck",\n  "source": {\n    "source": "url",\n    "url": "https://github.com/octocat/deck.git",\n    "sha": "${SHA}"\n  }\n}`

const EXAMPLES: HowItWorksExamples = {
  line: {
    title: 'Catppuccin Frappé',
    previews: [
      { scenarioKey: 'clean-main', segments: [{ text: 'Opus 4.8 │ main' }] },
      { scenarioKey: 'fresh-session', segments: [{ text: 'Opus 4.8 │ new' }] },
      { scenarioKey: 'dirty-feature', segments: [{ text: 'Opus 4.8 │ dirty' }] },
      { scenarioKey: 'near-full', segments: [{ text: 'Opus 4.8 │ fourth' }] },
    ],
  },
  mod: { detail: MOD, entry: ENTRY, entryHtml: `<pre class="shiki"><code>${ENTRY}</code></pre>` },
}

const STEPS = [
  'Pinned to one version',
  'Run in a sandbox',
  "Reviewed before it's listed",
  'Listed with what it can reach',
]

const step = (title: string) => screen.getByRole('region', { name: title })
/** The page's sections, in order: the four steps, then what review can't promise. */
const sectionTitles = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)

describe('HowItWorksContent', () => {
  // Small step titles under a big h1 ran together: each check is its own numbered h2 section,
  // set apart by a rule, so the page's outline is the four steps.
  it('names the page and walks the four checks in order, each a numbered, linkable section', () => {
    render(<HowItWorksContent examples={EXAMPLES} />)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'How statuslin.es checks mods and status lines',
      }),
    ).toBeTruthy()
    expect(sectionTitles()).toEqual([...STEPS, "What review can't promise"])
    STEPS.forEach((title, i) => {
      expect(step(title).id).not.toBe('')
      expect(step(title).textContent?.startsWith(`${i + 1}${title}`)).toBe(true)
      expect(step(title).closest('[data-slot="ruled-sections"]')).not.toBeNull()
    })
  })

  // The proof is the real thing: the entry Claude Code installs from, with the commit it pins.
  it("shows the example mod's marketplace entry, pinned to its commit", () => {
    render(<HowItWorksContent examples={EXAMPLES} />)

    const pinned = within(step('Pinned to one version'))
    expect(step('Pinned to one version').querySelector('.shiki')?.textContent).toContain(
      `"sha": "${SHA}"`,
    )
    expect(pinned.getByRole('link', { name: 'statuslin.es/marketplace.json' })).toBeTruthy()
  })

  it('shows the example status line as the sandbox recorded it', () => {
    render(<HowItWorksContent examples={EXAMPLES} />)

    const sandbox = within(step('Run in a sandbox'))
    expect(sandbox.getByText('Opus 4.8 │ main')).toBeTruthy()
    expect(sandbox.queryByText('Opus 4.8 │ fourth')).toBeNull()
    expect(sandbox.getByText('Opus 4.8 │ new')).toBeTruthy()
  })

  // "Sandbox" must never read as a promise about the reader's own machine.
  it('says the sandbox is only for previews, and that installed it runs with your permissions', () => {
    render(<HowItWorksContent examples={EXAMPLES} />)

    const sandbox = within(step('Run in a sandbox'))
    expect(sandbox.getByText('The sandbox is only for previews')).toBeTruthy()
    expect(sandbox.getByText(/runs on your machine with your permissions/)).toBeTruthy()
  })

  it('lists what review looks at, and that an update is checked again', () => {
    render(<HowItWorksContent examples={EXAMPLES} />)

    const reviewed = within(step("Reviewed before it's listed"))
    expect(reviewed.getAllByRole('listitem')).toHaveLength(4)
    expect(reviewed.getByText(/The live version stays up until/)).toBeTruthy()
  })

  it("shows the example mod's reach as its own page does", () => {
    render(<HowItWorksContent examples={EXAMPLES} />)

    const reach = within(step('Listed with what it can reach'))
    expect(reach.getByRole('heading', { level: 3, name: 'What this mod can do' })).toBeTruthy()
    expect(reach.getByText(/Deck/)).toBeTruthy()
  })

  it('reads whole with no examples to show', () => {
    render(<HowItWorksContent examples={{ line: null, mod: null }} />)

    expect(sectionTitles()).toEqual([...STEPS, "What review can't promise"])
    expect(document.querySelector('.shiki')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'What this mod can do' })).toBeNull()
  })

  // Review is real, but the page never says a person reads every line, nor that review makes it safe.
  it('promises no safety, claims no person reads every listing, and keeps the voice rules', () => {
    const { container } = render(<HowItWorksContent examples={EXAMPLES} />)
    const page = container.textContent ?? ''
    expect(page).not.toMatch(/guaranteed safe|100% safe|completely safe/i)
    expect(page).not.toMatch(/\b(a person|a human|every mod|every listing)\b/i)
    expect(page.replace(/\/statusline|statusLine/g, '')).not.toMatch(/statusline/i)
    expect(page).not.toContain('—')
  })

  it("says what review can't promise, and sends the reader to the mod safety guide", () => {
    render(<HowItWorksContent examples={EXAMPLES} />)

    const limits = within(screen.getByRole('region', { name: "What review can't promise" }))
    expect(limits.getByText('A reviewer can miss something.')).toBeTruthy()
    expect(
      limits.getByRole('link', { name: 'Are Claude Code mods safe?' }).getAttribute('href'),
    ).toBe('/guide/are-claude-code-mods-safe')
  })
})
