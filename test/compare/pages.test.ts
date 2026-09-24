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
    expect(page?.tools.map((t) => t.name)).toEqual(['ccstatusline', 'claude-powerline'])
    expect(page?.cards.map((c) => c.card.slug)).toEqual([
      'three-jobs',
      'five-jobs',
      'powerline-look',
    ])
    expect(page?.picks.map((p) => p.name)).toEqual([
      'ccstatusline',
      'claude-powerline',
      'A gallery status line',
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
      const copy = [page.title, page.description, page.heading, ...page.intro]
      copy.push(...page.picks.map((p) => p.text))
      copy.push(...page.tools.flatMap((t) => Object.values(t.facts)))
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
