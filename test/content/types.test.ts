import { describe, expect, it } from 'vitest'
import { parseGeneratedContent } from '@/content/types'

const VALID = {
  whatItShows: ['Current git branch', 'Model name'],
  requirements: ['bash', 'git on PATH'],
  behaviorNotes: ['Shows a * suffix when the working tree is dirty'],
}

describe('parseGeneratedContent', () => {
  it('parses a bare JSON object', () => {
    expect(parseGeneratedContent(JSON.stringify(VALID))).toEqual(VALID)
  })

  it('parses JSON wrapped in a markdown fence', () => {
    const raw = `\`\`\`json\n${JSON.stringify(VALID)}\n\`\`\``
    expect(parseGeneratedContent(raw)).toEqual(VALID)
  })

  it('parses JSON surrounded by stray prose', () => {
    const raw = `Here is the content you asked for:\n${JSON.stringify(VALID)}\nLet me know!`
    expect(parseGeneratedContent(raw)).toEqual(VALID)
  })

  it('strips unknown keys instead of storing them', () => {
    const raw = JSON.stringify({ ...VALID, extra: 'nope' })
    expect(parseGeneratedContent(raw)).toEqual(VALID)
  })

  it('allows an empty section', () => {
    const empty = { ...VALID, behaviorNotes: [] }
    expect(parseGeneratedContent(JSON.stringify(empty))).toEqual(empty)
  })

  it('throws when output contains no JSON object', () => {
    expect(() => parseGeneratedContent('sorry, I cannot do that')).toThrow(/no JSON object/i)
  })

  it('throws on malformed JSON', () => {
    // Both braces present so extraction succeeds and JSON.parse is what fails.
    expect(() => parseGeneratedContent('{ whatItShows: [oops }')).toThrow(/not valid JSON/i)
  })

  it('throws when a section is missing', () => {
    const { behaviorNotes: _drop, ...missing } = VALID
    expect(() => parseGeneratedContent(JSON.stringify(missing))).toThrow(/failed validation/i)
  })

  it('throws when a section has the wrong type', () => {
    const bad = { ...VALID, requirements: 'bash' }
    expect(() => parseGeneratedContent(JSON.stringify(bad))).toThrow(/failed validation/i)
  })

  it('throws on empty-string items', () => {
    const bad = { ...VALID, whatItShows: ['', 'Model name'] }
    expect(() => parseGeneratedContent(JSON.stringify(bad))).toThrow(/failed validation/i)
  })
})
