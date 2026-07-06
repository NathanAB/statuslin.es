import { describe, expect, it } from 'vitest'
import { buildTagsPrompt, parseSuggestedTags } from '@/content/tags'
import { TAG_VOCABULARY } from '@/gallery/facets'

describe('parseSuggestedTags', () => {
  it('parses a clean JSON array and keeps only vocabulary tags', () => {
    expect(parseSuggestedTags('["git", "cost", "made-up"]')).toEqual(['git', 'cost'])
  })
  it('survives markdown fences and surrounding prose', () => {
    expect(parseSuggestedTags('Here you go:\n```json\n["minimal"]\n```')).toEqual(['minimal'])
  })
  it('dedupes', () => {
    expect(parseSuggestedTags('["git","git"]')).toEqual(['git'])
  })
  it('throws when there is no JSON array', () => {
    expect(() => parseSuggestedTags('no tags for you')).toThrow(/no JSON array/)
  })
})

describe('buildTagsPrompt', () => {
  const prompt = buildTagsPrompt({
    title: 'My Line',
    description: 'shows git',
    source: 'echo "$(git branch --show-current)"',
    previewLines: ['main | 42%'],
  })
  it('embeds the vocabulary, the source, and the previews', () => {
    for (const tag of TAG_VOCABULARY) expect(prompt).toContain(tag)
    expect(prompt).toContain('git branch --show-current')
    expect(prompt).toContain('main | 42%')
  })
})
