import { describe, expect, it } from 'vitest'
import { configJsonLd, guideJsonLd, homeJsonLd, jsonLdScript, resourcesJsonLd } from '@/lib/json-ld'

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
    }) as Array<Record<string, unknown>>
    expect(code).not.toHaveProperty('author')
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

describe('guideJsonLd', () => {
  it('is a TechArticle at /guide', () => {
    const data = guideJsonLd('https://statuslin.es') as {
      '@type': string
      url: string
      headline: string
    }
    expect(data['@type']).toBe('TechArticle')
    expect(data.url).toBe('https://statuslin.es/guide')
    expect(data.headline).toBe('How to Set Up a Claude Code Status Line')
  })
})
