import { describe, expect, it } from 'vitest'
import type { ModPageCopy } from '@/content/types'
import { gallerySearchText, matchesSearch, normalizeSearchQuery } from '@/gallery/search'

const plain = {
  title: 'Weather Bar',
  description: 'Shows the forecast beside your branch.',
  author: null,
  tags: [],
  copy: null,
}

const copy: ModPageCopy = {
  summary: 'Puts a burn meter under the prompt.',
  howItWorks: ['Reads the session transcript', 'Draws a gauge'],
  goodToKnow: ['Needs jq on your PATH'],
  details: { showsUp: 'Above the input box', commands: ['/burn'] },
}

const matches = (item: Partial<Parameters<typeof gallerySearchText>[0]>, query: string) =>
  matchesSearch(gallerySearchText({ ...plain, ...item }), query)

describe('gallery search', () => {
  it('matches a word from the title or the description', () => {
    expect(matches({}, 'weather')).toBe(true)
    expect(matches({}, 'forecast')).toBe(true)
    expect(matches({}, 'stocks')).toBe(false)
  })

  it('ignores case on both sides', () => {
    expect(matches({}, 'WEATHER bar')).toBe(true)
  })

  it('matches part of a word', () => {
    expect(matches({}, 'fore')).toBe(true)
  })

  it('needs every term of the query to match, in any field and any order', () => {
    expect(matches({}, 'branch weather')).toBe(true)
    expect(matches({}, 'weather stocks')).toBe(false)
  })

  it('matches everything for an empty query', () => {
    expect(matches({}, '')).toBe(true)
    expect(matchesSearch(gallerySearchText(plain), undefined)).toBe(true)
  })

  it("finds an item by its author's GitHub login", () => {
    expect(matches({ author: 'Octocat' }, 'octocat')).toBe(true)
  })

  it('finds an item by a tag slug and by the label its card shows for that tag', () => {
    // The card says "Tokens" for token-usage, a word the slug alone does not contain.
    expect(matches({ tags: ['token-usage'] }, 'token-usage')).toBe(true)
    expect(matches({ tags: ['token-usage'] }, 'tokens')).toBe(true)
    expect(matches({ tags: [] }, 'tokens')).toBe(false)
  })

  it('finds an item by any part of its page copy', () => {
    for (const query of ['burn meter', 'session transcript', 'gauge', 'jq', 'input box', '/burn']) {
      expect(matches({ copy }, query)).toBe(true)
      expect(matches({}, query)).toBe(false)
    }
  })
})

describe('normalizeSearchQuery', () => {
  it('trims the query and collapses its whitespace', () => {
    expect(normalizeSearchQuery('  git \t  branch\n ')).toBe('git branch')
  })

  it('drops an empty or blank query', () => {
    expect(normalizeSearchQuery('')).toBeUndefined()
    expect(normalizeSearchQuery('   ')).toBeUndefined()
  })

  it('keeps only a string', () => {
    expect(normalizeSearchQuery(['git'])).toBeUndefined()
    expect(normalizeSearchQuery({ q: 'git' })).toBeUndefined()
    expect(normalizeSearchQuery(undefined)).toBeUndefined()
  })

  it('caps the query at 100 characters', () => {
    expect(normalizeSearchQuery('a'.repeat(150))).toBe('a'.repeat(100))
    expect(normalizeSearchQuery(`${'a'.repeat(99)} b`)).toBe('a'.repeat(99))
  })
})
