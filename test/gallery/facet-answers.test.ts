import { describe, expect, it } from 'vitest'
import { FACET_BY_SLUG } from '@/gallery/facets'
import { SCENARIOS } from '@/render/scenarios'

function payloadFieldNames(): Set<string> {
  const names = new Set<string>()
  const walk = (value: unknown, path: string[]) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return
    for (const [key, child] of Object.entries(value)) {
      const next = [...path, key]
      for (let start = 0; start < next.length; start++) {
        names.add(next.slice(start).join('.'))
      }
      walk(child, next)
    }
  }
  for (const scenario of SCENARIOS) walk(scenario.stdin, [])
  return names
}

function citedFields(text: string): string[] {
  return text.match(/\b[a-z][a-z0-9]*(?:[._][a-z0-9]+)+\b/g) ?? []
}

const ANSWERED = ['token-usage', 'quota', 'git']

describe('facet answers and FAQ', () => {
  it('answers exactly the token-usage, quota, and git facets', () => {
    const answered = [...FACET_BY_SLUG.values()].filter((f) => f.answer).map((f) => f.slug)
    const withFaq = [...FACET_BY_SLUG.values()].filter((f) => f.faq).map((f) => f.slug)
    expect(answered.sort()).toEqual(['git', 'quota', 'token-usage'])
    expect(withFaq.sort()).toEqual(['git', 'quota', 'token-usage'])
  })

  it('keeps each answer between 40 and 60 words with 2 or 3 FAQ entries', () => {
    for (const slug of ANSWERED) {
      const facet = FACET_BY_SLUG.get(slug)
      const words = facet?.answer?.split(/\s+/).length ?? 0
      expect({ slug, fits: words >= 40 && words <= 60 }).toEqual({ slug, fits: true })
      expect([2, 3]).toContain(facet?.faq?.length)
    }
  })

  it('cites only stdin fields that exist in the rendered scenario payloads', () => {
    const real = payloadFieldNames()
    for (const slug of ANSWERED) {
      const facet = FACET_BY_SLUG.get(slug)
      const prose = [facet?.answer ?? '', ...(facet?.faq ?? []).map((e) => e.answer)].join(' ')
      const invented = citedFields(prose).filter((name) => !real.has(name))
      expect({ slug, invented }).toEqual({ slug, invented: [] })
    }
  })

  it('cites the fields a visitor needs for each facet', () => {
    expect(citedFields(FACET_BY_SLUG.get('token-usage')?.answer ?? '')).toContain(
      'context_window.used_percentage',
    )
    expect(citedFields(FACET_BY_SLUG.get('quota')?.answer ?? '')).toContain('rate_limits.five_hour')
    expect(citedFields(FACET_BY_SLUG.get('git')?.answer ?? '')).toContain('workspace.current_dir')
  })
})
