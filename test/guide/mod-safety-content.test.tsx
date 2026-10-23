// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MOD_SAFETY_FAQ } from '@/guide/mod-safety-faq'
import { MOD_TILE_LABEL, THROUGH_PROGRAMS } from '@/mods/mod-fact-tiles'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => <a href={params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to}>{children}</a>,
}))

const { ModSafetyContent } = await import('@/guide/mod-safety-content')

const SECTIONS = [
  'What a mod can do once installed',
  'What claude plugin validate reports',
  'What statuslin.es checks before listing a mod',
  "What's still on you",
  'Check a mod yourself',
  'Common questions',
]

const region = (name: string) => screen.getByRole('region', { name })
const follows = (first: Node, second: Node) =>
  Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('ModSafetyContent', () => {
  it('opens with the question as its title and the short answer under it', () => {
    render(<ModSafetyContent />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Are Claude Code mods safe?' }),
    ).toBeTruthy()
    expect(
      screen.getByText(
        "A mod runs inside Claude Code with your permissions and no sandbox. Whether it's safe depends on its code, and on who has read that code.",
      ),
    ).toBeTruthy()
  })

  it('lists every section in its contents, in page order, each linking to its section', () => {
    const { container } = render(<ModSafetyContent />)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(SECTIONS)
    const contents = screen.getByRole('navigation', { name: 'On this page' })
    const links = within(contents).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(SECTIONS)
    for (const link of links) {
      const section = container.querySelector(link.getAttribute('href') ?? '#none')
      expect(section?.querySelector('h2')?.textContent).toBe(link.textContent)
    }
  })

  it('shows what a mod can do as eight short tiles, in the order the docs give them', () => {
    render(<ModSafetyContent />)
    const tiles = within(
      within(region('What a mod can do once installed')).getByRole('list', {
        name: 'What a mod can do',
      }),
    ).getAllByRole('listitem')
    expect(tiles.map((tile) => tile.textContent)).toEqual([
      'Reads and writes your files',
      'Runs programs',
      'Makes web requests',
      'Reads your environment variables',
      'Calls Claude and uses your tokens',
      'Reads the conversation',
      'Adds slash commands',
      "Approves Claude's tool calls for you",
    ])
  })

  it('warns under the tiles that none of it asks first and the sandbox leaves a mod out', () => {
    render(<ModSafetyContent />)
    const section = within(region('What a mod can do once installed'))
    const tiles = section.getByRole('list', { name: 'What a mod can do' })
    const asks = section.getByRole('heading', { level: 3, name: 'None of these asks you first' })
    const sandbox = section.getByText(
      "Claude Code's sandbox covers the commands Claude runs, not a mod or the programs a mod starts.",
    )
    expect(follows(tiles, asks)).toBe(true)
    expect(follows(asks, sandbox)).toBe(true)
  })

  it('explains each footprint tile by the label the mod page shows, then what programs hide', () => {
    render(<ModSafetyContent />)
    const section = within(region('What claude plugin validate reports'))
    for (const label of [
      MOD_TILE_LABEL.usesYourPlan,
      MOD_TILE_LABEL.changesFiles,
      MOD_TILE_LABEL.network,
      MOD_TILE_LABEL.commands,
    ]) {
      expect(section.getByRole('rowheader', { name: label })).toBeTruthy()
    }
    expect(
      follows(section.getByRole('table'), section.getByText(new RegExp(THROUGH_PROGRAMS))),
    ).toBe(true)
  })

  it("lists what statuslin.es checks and what's still on you, point by point", () => {
    render(<ModSafetyContent />)
    const checks = region('What statuslin.es checks before listing a mod')
    expect(
      within(checks)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Each mod is reviewed at one commit: its footprint and its source.',
      "statuslin.es's marketplace, /marketplace.json, pins that commit, so a later push to the author's repository doesn't change what you install.",
      'An update is a new commit, and its changes are reviewed before it goes live.',
      'If the author deletes the pinned commit, new installs fail.',
    ])
    expect(
      within(checks).getByRole('link', { name: '/marketplace.json' }).getAttribute('href'),
    ).toBe('/marketplace.json')
    expect(
      within(checks)
        .getByRole('link', { name: 'How statuslin.es checks mods and status lines' })
        .getAttribute('href'),
    ).toBe('/how-it-works')
    const onYou = region("What's still on you")
    expect(
      within(onYou)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Review and pinning lower the risk but guarantee nothing.',
      'A reviewer can miss something.',
      'Read the source before you install a mod, and again before you update it.',
    ])
  })

  it('walks through checking a mod in four numbered steps, then points to the reviewed mods', () => {
    render(<ModSafetyContent />)
    const section = within(region('Check a mod yourself'))
    const list = section.getByRole('list', { name: 'Steps' })
    const steps = within(list).getAllByRole('listitem')
    expect(
      steps.map((step) => within(step).getByRole('heading', { level: 3 }).textContent),
    ).toEqual([
      "Clone the mod's repository",
      'Read its footprint',
      'Read its hooks',
      'Trace its calls',
    ])
    const [clone, footprint, hooks, calls] = steps.map((step) => step.textContent ?? '')
    expect(clone).toContain('Check out the commit its page links.')
    expect(footprint).toContain('Run claude plugin validate <path> on the plugin folder')
    expect(footprint).toContain('calls:')
    expect(hooks).toContain('Open hooks/hooks.json to find the module it loads')
    for (const call of ['$.process', '$.fs', '$.http', '$.env', '$.model']) {
      expect(calls).toContain(call)
    }
    const mods = section.getByRole('link', { name: 'reviewed mods on statuslin.es' })
    expect(mods.getAttribute('href')).toBe('/mods')
    expect(follows(list, mods)).toBe(true)
  })

  it('answers its common questions last', () => {
    render(<ModSafetyContent />)
    for (const entry of MOD_SAFETY_FAQ) {
      expect(screen.getByRole('heading', { level: 3, name: entry.question })).toBeTruthy()
    }
  })

  it('lists only checks the docs back', () => {
    const { container } = render(<ModSafetyContent />)
    expect(container.textContent).not.toMatch(/eval|global `?fetch/)
    expect(container.textContent).toMatch(/approve/i)
  })

  it('promises no safety, claims no person reads every mod, and keeps the voice rules', () => {
    const { container } = render(<ModSafetyContent />)
    const page = container.textContent ?? ''
    expect(page).not.toMatch(/guaranteed safe|100% safe|completely safe/i)
    expect(page).not.toMatch(/\b(a person|a human|every mod|every listing)\b/i)
    expect(page.replace(/\/statusline|statusLine/g, '')).not.toMatch(/statusline/i)
    expect(page).not.toContain('—')
  })
})
