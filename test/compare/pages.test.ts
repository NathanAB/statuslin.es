import { describe, expect, it } from 'vitest'
import { buildComparePage, COMPARE_PATHS, liveComparePaths } from '@/compare/pages'
import type { GalleryCard } from '@/gallery/queries'

function card(slug: string, tags: string[]): GalleryCard {
  return {
    configId: slug,
    slug,
    title: slug,
    description: 'desc',
    interpreter: 'bash',
    copyCount: 0,
    author: null,
    preview: [],
    networkHosts: [],
    readsClaudeToken: false,
    tags: [...tags, 'bash'],
  }
}

const threeJobs = card('three-jobs', ['git', 'token-usage', 'quota'])
const oneJob = card('one-job', ['git', 'minimal'])
const fiveJobs = card('five-jobs', ['git', 'token-usage', 'cost', 'quota', 'multi-line'])
const twoJobs = card('two-jobs', ['weather', 'git', 'cost'])
const burnRate = card('burn-rate', ['git', 'quota', 'burn-rate'])
const powerlineLook = card('powerline-look', ['git', 'token-usage', 'powerline', 'themed'])
const gallery = [threeJobs, oneJob, fiveJobs, twoJobs, burnRate, powerlineLook]

describe('buildComparePage', () => {
  it('keeps gallery configs sharing at least three of the tool’s jobs, in copy order', () => {
    const page = buildComparePage('/alternatives/ccstatusline', gallery)
    expect(page?.cards.map((c) => c.card.slug)).toEqual([
      'three-jobs',
      'five-jobs',
      'powerline-look',
    ])
    expect(page?.cards[0]?.why).toBe('Shows git, tokens, and limits. Bash script.')
  })

  it('counts burn rate as a claude-powerline job but not a ccstatusline job', () => {
    const powerline = buildComparePage('/alternatives/claude-powerline', gallery)
    expect(powerline?.cards.map((c) => c.card.slug)).toEqual([
      'three-jobs',
      'five-jobs',
      'burn-rate',
      'powerline-look',
    ])
  })

  it('matches the versus page on the jobs both tools share', () => {
    const page = buildComparePage('/compare/ccstatusline-vs-claude-powerline', gallery)
    expect(page?.cards.map((c) => c.card.slug)).toEqual([
      'three-jobs',
      'five-jobs',
      'powerline-look',
    ])
  })

  it('leads the versus page with one short intro, a fact table, and one-line picks', () => {
    const page = buildComparePage('/compare/ccstatusline-vs-claude-powerline', gallery)
    expect(page?.intro).toBe(
      'Two npm tools for the Claude Code status line. The biggest difference is setup: ccstatusline uses an interactive terminal UI, claude-powerline uses a JSON file.',
    )
    expect(page?.facts.columns.map((c) => c.name)).toEqual(['ccstatusline', 'claude-powerline'])
    expect(page?.facts.rows).toEqual([
      { label: 'Setup', cells: ['Interactive terminal UI', 'JSON file or /powerline wizard'] },
      { label: 'Runs on', cells: ['Node.js or Bun', 'Node.js 18+ and Git'] },
      { label: 'Themes', cells: ['Powerline themes', '6 built-in, plus custom'] },
      { label: 'Font', cells: ['Powerline font', 'Nerd Font, or ASCII mode'] },
      { label: 'Usage limits', cells: ['Yes', 'Yes'] },
      { label: 'Latest release', cells: ['v2.2.30, Sep 17', 'v1.32.0, Sep 23'] },
    ])
    expect(page?.facts.checkedOn).toBe('2026-09-24')
    expect(page?.picks).toEqual([
      'Want a setup screen? ccstatusline.',
      'Want a config file you can commit? claude-powerline.',
      'Want to read one script and see its real output first? Pick a status line below.',
    ])
  })

  it('shows an alternatives page only its own tool’s facts and a two-line pick', () => {
    const page = buildComparePage('/alternatives/claude-powerline', gallery)
    expect(page?.intro).toBe(
      'Single scripts from the gallery that cover at least 3 of the same features as claude-powerline, each shown with its real output.',
    )
    expect(page?.facts.columns.map((c) => c.name)).toEqual(['claude-powerline'])
    expect(page?.facts.rows[0]).toEqual({
      label: 'Setup',
      cells: ['JSON file or /powerline wizard'],
    })
    expect(page?.picks).toEqual([
      'Pick claude-powerline if you want a config file you can commit.',
      'Pick a gallery status line if you want to read one script and see its real output first.',
    ])
  })

  it('refuses a page that cannot show three relevant previews', () => {
    expect(buildComparePage('/alternatives/ccstatusline', [threeJobs, fiveJobs, oneJob])).toBeNull()
  })

  it('returns null for a path outside the registry', () => {
    expect(buildComparePage('/alternatives/nope', gallery)).toBeNull()
  })

  it('keeps every page’s search snippet in length and free of em dashes', () => {
    for (const path of COMPARE_PATHS) {
      const page = buildComparePage(path, gallery)
      if (!page) throw new Error(`no page for ${path}`)
      expect(page.title.length, page.title).toBeLessThanOrEqual(60)
      expect(page.description.length, page.description).toBeGreaterThanOrEqual(140)
      expect(page.description.length, page.description).toBeLessThanOrEqual(160)
      const copy = [page.title, page.description, page.heading, page.intro, ...page.picks]
      copy.push(...page.facts.rows.flatMap((r) => r.cells))
      expect(copy.filter((s) => s.includes('—'))).toEqual([])
    }
  })
})

describe('liveComparePaths', () => {
  it('lists the pages that have enough relevant previews to ship', () => {
    expect(liveComparePaths(gallery)).toEqual([
      '/alternatives/ccstatusline',
      '/alternatives/claude-powerline',
      '/compare/ccstatusline-vs-claude-powerline',
    ])
    expect(liveComparePaths([oneJob])).toEqual([])
  })
})
