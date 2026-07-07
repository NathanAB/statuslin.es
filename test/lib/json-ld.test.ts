import { describe, expect, it } from 'vitest'
import { configJsonLd, facetJsonLd, homeJsonLd, jsonLdScript, resourcesJsonLd } from '@/lib/json-ld'

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
  it('builds a CollectionPage with an ItemList of config URLs', () => {
    const data = homeJsonLd('https://statuslin.es', [
      { slug: 'a-1', title: 'Alpha' },
      { slug: 'b-2', title: 'Beta' },
    ]) as Record<string, unknown>
    expect(data['@type']).toBe('CollectionPage')
    const list = data.mainEntity as { itemListElement: Array<Record<string, unknown>> }
    expect(list.itemListElement).toHaveLength(2)
    expect(list.itemListElement[0]).toMatchObject({
      position: 1,
      name: 'Alpha',
      url: 'https://statuslin.es/c/a-1',
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
    upvoteCount: 12,
    keywords: ['Git', 'Token usage'],
    updatedAt: '2026-07-06',
    generatedContent: {
      whatItShows: ['The git branch.', 'A context progress bar.'],
      requirements: ['Bash 4+.', 'A nerd font.'],
      behaviorNotes: ['Colors fade as context fills.'],
    } as {
      whatItShows: string[]
      requirements: string[]
      behaviorNotes: string[]
    } | null,
  }

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

  it('falls back to the CC0 url when license is null', () => {
    const [code] = configJsonLd('https://statuslin.es', {
      ...base,
      license: null,
    }) as Array<Record<string, unknown>>
    expect(code!.license).toContain('creativecommons.org')
  })

  // --- GEO enrichment: freshness, statistics, entity clarity, extractable Q&A ---

  it('enriches SoftwareSourceCode with freshness, upvote stat, platform, and keywords', () => {
    const [code] = configJsonLd('https://statuslin.es', base) as Array<Record<string, unknown>>
    expect(code).toMatchObject({
      dateModified: '2026-07-06',
      runtimePlatform: 'Claude Code',
      interactionStatistic: {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/LikeAction',
        userInteractionCount: 12,
      },
    })
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

  it('appends a FAQPage built from the generated content', () => {
    const nodes = configJsonLd('https://statuslin.es', base) as Array<Record<string, unknown>>
    const faq = nodes.find((n) => n['@type'] === 'FAQPage')
    expect(faq).toBeDefined()
    const questions = faq!.mainEntity as Array<{
      '@type': string
      name: string
      acceptedAnswer: { text: string }
    }>
    expect(questions).toHaveLength(3)
    expect(questions[0]).toMatchObject({
      '@type': 'Question',
      name: 'What does Powerline Dracula show?',
      acceptedAnswer: { '@type': 'Answer', text: 'The git branch. A context progress bar.' },
    })
    expect(questions[1]!.name).toBe('What does Powerline Dracula require?')
    expect(questions[2]!.name).toBe('How does Powerline Dracula behave?')
  })

  it('omits the FAQPage when there is no generated content', () => {
    const nodes = configJsonLd('https://statuslin.es', {
      ...base,
      generatedContent: null,
    }) as Array<Record<string, unknown>>
    expect(nodes.some((n) => n['@type'] === 'FAQPage')).toBe(false)
    // still emits SoftwareSourceCode + BreadcrumbList
    expect(nodes).toHaveLength(2)
  })

  it('drops FAQ questions whose section is empty', () => {
    const nodes = configJsonLd('https://statuslin.es', {
      ...base,
      generatedContent: {
        whatItShows: ['The git branch.'],
        requirements: [],
        behaviorNotes: [],
      },
    }) as Array<Record<string, unknown>>
    const faq = nodes.find((n) => n['@type'] === 'FAQPage')
    const questions = faq!.mainEntity as Array<{ name: string }>
    expect(questions).toHaveLength(1)
    expect(questions[0]!.name).toBe('What does Powerline Dracula show?')
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
  const facet = { slug: 'git', titleBase: 'Claude Code Status Lines That Show Git Status' }
  const [page, crumbs] = facetJsonLd(
    'https://example.test',
    facet,
    [{ slug: 'a', title: 'A' }],
    '2026-07-06',
  ) as [Record<string, unknown>, Record<string, unknown>]

  it('is a CollectionPage listing the configs', () => {
    expect(page['@type']).toBe('CollectionPage')
    expect(page.url).toBe('https://example.test/status-lines/git')
    const list = page.mainEntity as { itemListElement: Array<{ url: string }> }
    expect(list.itemListElement[0]?.url).toBe('https://example.test/c/a')
  })
  it('carries a breadcrumb trail back to the gallery', () => {
    expect(crumbs['@type']).toBe('BreadcrumbList')
    const items = crumbs.itemListElement as Array<{ item: string }>
    expect(items[0]?.item).toBe('https://example.test')
    expect(items[1]?.item).toBe('https://example.test/status-lines/git')
  })
  it('carries dateModified when an updated date is given (freshness signal)', () => {
    expect(page.dateModified).toBe('2026-07-06')
  })
  it('omits dateModified when there is no updated date', () => {
    const [p] = facetJsonLd('https://example.test', facet, [{ slug: 'a', title: 'A' }], null) as [
      Record<string, unknown>,
    ]
    expect(p).not.toHaveProperty('dateModified')
  })
})
