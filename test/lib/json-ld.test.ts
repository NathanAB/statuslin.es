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
  it('builds SoftwareSourceCode + BreadcrumbList for a config', () => {
    const [code, crumbs] = configJsonLd('https://statuslin.es', {
      slug: 'powerline-dracula-6936b97c',
      title: 'Powerline Dracula',
      description: 'A Powerline-style status line.',
      interpreter: 'bash',
      authorName: 'LindseyB',
      license: null,
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
      slug: 's',
      title: 'T',
      description: 'd',
      interpreter: 'bash',
      authorName: null,
      license: null,
    }) as Array<Record<string, unknown>>
    expect(code).not.toHaveProperty('author')
  })

  it('emits the per-config license when present', () => {
    const [code] = configJsonLd('https://statuslin.es', {
      slug: 's',
      title: 'T',
      description: 'd',
      interpreter: 'bash',
      authorName: null,
      license: 'MIT',
    }) as Array<Record<string, unknown>>
    expect(code!.license).toBe('MIT')
  })

  it('falls back to the CC0 url when license is null', () => {
    const [code] = configJsonLd('https://statuslin.es', {
      slug: 's',
      title: 'T',
      description: 'd',
      interpreter: 'bash',
      authorName: null,
      license: null,
    }) as Array<Record<string, unknown>>
    expect(code!.license).toContain('creativecommons.org')
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
  const [page, crumbs] = facetJsonLd(
    'https://example.test',
    { slug: 'git', titleBase: 'Claude Code Status Lines That Show Git Status' },
    [{ slug: 'a', title: 'A' }],
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
})
