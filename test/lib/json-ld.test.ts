import { describe, expect, it } from 'vitest'
import type { PageCopy } from '@/content/types'
import { guideJsonLd } from '@/lib/guide-json-ld'
import {
  configJsonLd,
  facetHubJsonLd,
  facetJsonLd,
  faqPageJsonLd,
  homeJsonLd,
  jsonLdScript,
  resourcesJsonLd,
} from '@/lib/json-ld'
import { GUIDE_DATES, GUIDE_DESCRIPTION, GUIDE_PATH, GUIDE_TITLE_BASE } from '@/lib/page-title'

describe('jsonLdScript', () => {
  it('serializes to an application/ld+json script descriptor', () => {
    const s = jsonLdScript({ '@type': 'Thing', name: 'x' })
    expect(s.type).toBe('application/ld+json')
    expect(JSON.parse(s.children)).toEqual({ '@type': 'Thing', name: 'x' })
  })

  it('escapes < so user content cannot close the script tag', () => {
    const s = jsonLdScript({ name: '</script><script>alert(1)' })
    expect(s.children).not.toContain('</script>')
    expect(s.children).toContain('\\u003c/script>')
  })
})

describe('homeJsonLd', () => {
  it('builds WebSite identity plus a CollectionPage of the visible cards, mods included', () => {
    const nodes = homeJsonLd(
      'https://statuslin.es',
      [
        { kind: 'mod', slug: 'file-tree', title: 'File Tree' },
        { kind: 'status-line', slug: 'a-1', title: 'Alpha' },
      ],
      { page: 1, pageSize: 10 },
    ) as Array<Record<string, unknown>>
    expect(nodes).toHaveLength(3)
    expect(nodes[0]).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'statuslin.es',
      url: 'https://statuslin.es',
    })
    expect(nodes[1]).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'statuslin.es',
      url: 'https://statuslin.es',
      logo: 'https://statuslin.es/apple-touch-icon.png',
      sameAs: ['https://github.com/NathanAB/statuslin.es'],
    })
    expect(nodes[2]).toEqual({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Claude Code Mods',
      url: 'https://statuslin.es',
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'File Tree',
            url: 'https://statuslin.es/mods/file-tree',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Alpha',
            url: 'https://statuslin.es/c/a-1',
          },
        ],
      },
    })
  })
})

describe('configJsonLd', () => {
  // A fully-populated config input; individual tests override the fields they exercise.
  const base = {
    slug: 'powerline-dracula-6936b97c',
    title: 'Powerline Dracula',
    description: 'A Powerline-style status line.',
    interpreter: 'bash',
    authorName: 'LindseyB',
    license: null as string | null,
    keywords: ['Git', 'Token usage'],
    updatedAt: '2026-07-06',
    generatedContent: {
      summary: 'Shows the git branch and a context bar.',
      howItWorks: ['Reads the session JSON on stdin', 'Runs `git` for the branch.'],
      goodToKnow: ['Needs Bash 4 or newer.', 'Uses Nerd Font glyphs'],
    } as PageCopy | null,
    primaryFacet: null as { slug: string; heading: string } | null,
  }

  it('breadcrumbs through the primary facet page when the config has one', () => {
    const [, crumbs] = configJsonLd('https://statuslin.es', {
      ...base,
      primaryFacet: { slug: 'git', heading: 'Claude Code status lines that show git status' },
    }) as Array<Record<string, unknown>>
    expect(crumbs?.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'statuslin.es', item: 'https://statuslin.es' },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Claude Code status lines that show git status',
        item: 'https://statuslin.es/status-lines/git',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Powerline Dracula',
        item: 'https://statuslin.es/c/powerline-dracula-6936b97c',
      },
    ])
  })

  it('breadcrumbs straight from home to the config without a primary facet', () => {
    const [, crumbs] = configJsonLd('https://statuslin.es', base) as Array<Record<string, unknown>>
    expect(crumbs?.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'statuslin.es', item: 'https://statuslin.es' },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Powerline Dracula',
        item: 'https://statuslin.es/c/powerline-dracula-6936b97c',
      },
    ])
  })

  it('builds SoftwareSourceCode + BreadcrumbList for a config', () => {
    const [code, crumbs] = configJsonLd('https://statuslin.es', {
      ...base,
      authorName: 'LindseyB',
    }) as Array<Record<string, unknown>>
    expect(code).toMatchObject({
      '@type': 'SoftwareSourceCode',
      name: 'Powerline Dracula',
      programmingLanguage: 'bash',
      url: 'https://statuslin.es/c/powerline-dracula-6936b97c',
      author: { '@type': 'Person', name: 'LindseyB' },
    })
    expect(code!.license).toContain('creativecommons.org')
    expect(crumbs?.['@type']).toBe('BreadcrumbList')
  })

  it('omits author when there is none', () => {
    const [code] = configJsonLd('https://statuslin.es', {
      ...base,
      authorName: null,
    }) as Array<Record<string, unknown>>
    expect(code).not.toHaveProperty('author')
  })

  it('emits the per-config license when present', () => {
    const [code] = configJsonLd('https://statuslin.es', {
      ...base,
      license: 'MIT',
    }) as Array<Record<string, unknown>>
    expect(code!.license).toBe('MIT')
  })

  // --- GEO enrichment: freshness, entity clarity, extractable Q&A ---

  it('enriches SoftwareSourceCode without presenting copies as install interactions', () => {
    const [code] = configJsonLd('https://statuslin.es', base) as Array<Record<string, unknown>>
    expect(code).toMatchObject({
      dateModified: '2026-07-06',
      runtimePlatform: 'Claude Code',
    })
    expect(code).not.toHaveProperty('interactionStatistic')
    // keywords carry the facet labels (schema.org accepts a comma-separated string)
    expect(code!.keywords).toBe('Git, Token usage')
  })

  it('omits dateModified and keywords when absent', () => {
    const [code] = configJsonLd('https://statuslin.es', {
      ...base,
      updatedAt: null,
      keywords: [],
    }) as Array<Record<string, unknown>>
    expect(code).not.toHaveProperty('dateModified')
    expect(code).not.toHaveProperty('keywords')
  })

  it('emits no FAQPage, since the page never shows its copy as questions', () => {
    const nodes = configJsonLd('https://statuslin.es', base) as Array<Record<string, unknown>>
    expect(nodes.map((n) => n['@type'])).toEqual(['SoftwareSourceCode', 'BreadcrumbList'])
  })
})

describe('faqPageJsonLd', () => {
  it('returns null when there are no questions', () => {
    expect(faqPageJsonLd([])).toBeNull()
  })

  it('emits answers as plain text without inline-code backticks', () => {
    const faq = faqPageJsonLd([
      { question: 'Where?', answer: 'Read `workspace.current_dir` first.' },
    ])
    expect(faq).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Where?',
          acceptedAnswer: { '@type': 'Answer', text: 'Read workspace.current_dir first.' },
        },
      ],
    })
  })
})

describe('guideJsonLd', () => {
  const guide = {
    path: GUIDE_PATH,
    headline: GUIDE_TITLE_BASE,
    description: GUIDE_DESCRIPTION,
    dates: GUIDE_DATES,
  }
  const nodes = guideJsonLd('https://statuslin.es', guide, [
    { question: 'Why?', answer: 'Because.' },
  ]) as Array<Record<string, unknown>>

  it('emits a dated TechArticle authored by the site plus a breadcrumb trail, never HowTo', () => {
    expect(nodes.some((node) => node['@type'] === 'HowTo')).toBe(false)
    expect(nodes[0]).toEqual({
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: 'How to Set Up a Claude Code Status Line',
      url: 'https://statuslin.es/guide',
      description: GUIDE_DESCRIPTION,
      author: { '@type': 'Organization', name: 'statuslin.es', url: 'https://statuslin.es' },
      datePublished: '2026-08-14',
      dateModified: '2026-10-18',
    })
    expect(nodes[1]).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'statuslin.es', item: 'https://statuslin.es' },
        { '@type': 'ListItem', position: 2, name: 'Guide', item: 'https://statuslin.es/guide' },
      ],
    })
  })

  it('emits the common questions as a FAQPage', () => {
    expect(nodes[2]).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Why?',
          acceptedAnswer: { '@type': 'Answer', text: 'Because.' },
        },
      ],
    })
  })

  it('runs a subpage breadcrumb through /guide and leaves out an empty FAQ', () => {
    const subpage = guideJsonLd('https://statuslin.es', {
      path: '/guide/sub',
      headline: 'A Subpage',
      description: 'About it.',
      dates: { published: '2026-10-01', modified: '2026-10-02' },
    }) as Array<Record<string, unknown>>

    expect(subpage.map((node) => node['@type'])).toEqual(['TechArticle', 'BreadcrumbList'])
    expect(subpage[0]).toMatchObject({
      headline: 'A Subpage',
      url: 'https://statuslin.es/guide/sub',
      datePublished: '2026-10-01',
      dateModified: '2026-10-02',
    })
    const crumbs = subpage[1] as { itemListElement: Array<{ name: string; item: string }> }
    expect(crumbs.itemListElement.map(({ name, item }) => ({ name, item }))).toEqual([
      { name: 'statuslin.es', item: 'https://statuslin.es' },
      { name: 'Guide', item: 'https://statuslin.es/guide' },
      { name: 'A Subpage', item: 'https://statuslin.es/guide/sub' },
    ])
  })
})

describe('resourcesJsonLd', () => {
  it('is a CollectionPage whose ItemList points at the external resources', () => {
    const data = resourcesJsonLd('https://statuslin.es', [
      { name: 'ccstatusline', url: 'https://github.com/sirmalloc/ccstatusline' },
    ]) as {
      '@type': string
      url: string
      mainEntity: { itemListElement: Array<{ name: string; url: string }> }
    }
    expect(data['@type']).toBe('CollectionPage')
    expect(data.url).toBe('https://statuslin.es/resources')
    expect(data.mainEntity.itemListElement[0]).toMatchObject({
      name: 'ccstatusline',
      url: 'https://github.com/sirmalloc/ccstatusline',
    })
  })
})

describe('facetJsonLd', () => {
  const facet = {
    slug: 'git',
    titleBase: 'Claude Code Status Lines That Show Git Status',
    topic: 'Git',
  }
  const [page, crumbs] = facetJsonLd(
    'https://example.test',
    facet,
    [{ kind: 'status-line', slug: 'a', title: 'A' }],
    '2026-07-06',
  ) as [Record<string, unknown>, Record<string, unknown>]

  it('is a CollectionPage listing the configs', () => {
    expect(page['@type']).toBe('CollectionPage')
    expect(page.url).toBe('https://example.test/status-lines/git')
    const list = page.mainEntity as { itemListElement: Array<{ url: string }> }
    expect(list.itemListElement[0]?.url).toBe('https://example.test/c/a')
  })
  it('lists a mod at its mod page, in the order given', () => {
    const [withMod] = facetJsonLd(
      'https://example.test',
      facet,
      [
        { kind: 'mod', slug: 'meter', title: 'Meter' },
        { kind: 'status-line', slug: 'a', title: 'A' },
      ],
      null,
    ) as [Record<string, unknown>]
    const list = withMod.mainEntity as { itemListElement: Array<Record<string, unknown>> }
    expect(list.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Meter', url: 'https://example.test/mods/meter' },
      { '@type': 'ListItem', position: 2, name: 'A', url: 'https://example.test/c/a' },
    ])
  })
  it('carries the breadcrumb trail the page shows: home, then the topics, then this topic', () => {
    expect(crumbs['@type']).toBe('BreadcrumbList')
    expect(crumbs.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'statuslin.es', item: 'https://example.test' },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Topics',
        item: 'https://example.test/status-lines',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Git',
        item: 'https://example.test/status-lines/git',
      },
    ])
  })
  it('carries dateModified when an updated date is given (freshness signal)', () => {
    expect(page.dateModified).toBe('2026-07-06')
  })
  it('omits dateModified when there is no updated date', () => {
    const [p] = facetJsonLd(
      'https://example.test',
      facet,
      [{ kind: 'status-line', slug: 'a', title: 'A' }],
      null,
    ) as [Record<string, unknown>]
    expect(p).not.toHaveProperty('dateModified')
  })
})

describe('facetHubJsonLd', () => {
  const [page, crumbs] = facetHubJsonLd('https://example.test', [
    { slug: 'git', heading: 'Claude Code status lines that show git status' },
    { slug: 'cost', heading: 'Claude Code status lines that track cost' },
  ]) as [Record<string, unknown>, Record<string, unknown>]

  it('is a CollectionPage listing each topic page in order', () => {
    expect(page['@type']).toBe('CollectionPage')
    expect(page.name).toBe('Claude Code Status Lines & Mods by Topic')
    expect(page.url).toBe('https://example.test/status-lines')
    expect((page.mainEntity as { itemListElement: unknown[] }).itemListElement).toEqual([
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Claude Code status lines that show git status',
        url: 'https://example.test/status-lines/git',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Claude Code status lines that track cost',
        url: 'https://example.test/status-lines/cost',
      },
    ])
  })

  it('carries the breadcrumb trail the page shows: home, then the topics', () => {
    expect(crumbs['@type']).toBe('BreadcrumbList')
    expect(crumbs.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'statuslin.es', item: 'https://example.test' },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Topics',
        item: 'https://example.test/status-lines',
      },
    ])
  })
})
