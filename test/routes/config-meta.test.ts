import { describe, expect, it } from 'vitest'
import { configMetaDescription } from '@/lib/page-title'
import { Route as ConfigRoute } from '@/routes/c.$slug'

const DETAIL = {
  slug: 'git-glance',
  title: 'Git Glance',
  description: 'My status line, with git, context and cost in one row.',
  interpreter: 'bash',
  author: null,
  license: 'MIT',
  facetLabels: [],
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  primaryFacet: null,
  generatedContent: null,
}

function meta(detail: Record<string, unknown>) {
  const head = ConfigRoute.options.head?.({
    loaderData: { detail, user: null, viewerIsAuthor: false, mods: [] },
  } as never) as { meta: Array<Record<string, string>> }
  return {
    description: head.meta.find((m) => m.name === 'description')?.content,
    og: head.meta.find((m) => m.property === 'og:description')?.content,
  }
}

describe('/c/$slug head', () => {
  it('describes the status line by its reviewed summary, without code marks', () => {
    const summary = 'Shows the `git` branch and context use in one line.'
    const expected = 'Shows the git branch and context use in one line.'

    expect(meta({ ...DETAIL, generatedContent: { summary } })).toEqual({
      description: expected,
      og: expected,
    })
  })

  it('falls back to the author’s description before the page has a summary', () => {
    expect(meta(DETAIL).description).toBe(configMetaDescription(DETAIL.description))
  })
})
