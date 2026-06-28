import { describe, expect, it } from 'vitest'
import { HttpError } from '@/lib/http'
import { SUBMIT_LIMITS, validateSubmitInput } from '@/submit/submit'

describe('SUBMIT_LIMITS', () => {
  it('exports expected cap values', () => {
    expect(SUBMIT_LIMITS.source).toBe(100_000)
    expect(SUBMIT_LIMITS.title).toBe(200)
    expect(SUBMIT_LIMITS.description).toBe(4000)
  })
})

describe('validateSubmitInput', () => {
  const valid = {
    interpreter: 'bash',
    source: 'echo hi',
    title: 'My Statusline',
    description: 'A cool statusline',
  }

  it('returns typed SubmitInput on valid input', () => {
    const result = validateSubmitInput(valid)
    expect(result.interpreter).toBe('bash')
    expect(result.source).toBe('echo hi')
    expect(result.title).toBe('My Statusline')
    expect(result.description).toBe('A cool statusline')
  })

  it('accepts node and python interpreters', () => {
    expect(() => validateSubmitInput({ ...valid, interpreter: 'node' })).not.toThrow()
    expect(() => validateSubmitInput({ ...valid, interpreter: 'python' })).not.toThrow()
  })

  it('defaults description to empty string when omitted', () => {
    const result = validateSubmitInput({ interpreter: 'bash', source: 'x', title: 'T' })
    expect(result.description).toBe('')
  })

  it('throws a 400 HttpError on bad input', () => {
    try {
      validateSubmitInput({ ...valid, interpreter: 'fish' })
      throw new Error('expected validateSubmitInput to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError)
      expect((err as HttpError).status).toBe(400)
    }
  })

  it('throws on invalid interpreter', () => {
    expect(() => validateSubmitInput({ ...valid, interpreter: 'fish' })).toThrow(
      'invalid interpreter',
    )
    expect(() => validateSubmitInput({ ...valid, interpreter: '' })).toThrow('invalid interpreter')
    expect(() => validateSubmitInput({ ...valid, interpreter: 'zsh' })).toThrow(
      'invalid interpreter',
    )
  })

  it('throws when source is empty string', () => {
    expect(() => validateSubmitInput({ ...valid, source: '' })).toThrow('source is required')
  })

  it('throws when source is only whitespace', () => {
    expect(() => validateSubmitInput({ ...valid, source: '   ' })).toThrow('source is required')
  })

  it('throws when title is empty string', () => {
    expect(() => validateSubmitInput({ ...valid, title: '' })).toThrow('title is required')
  })

  it('throws when title is only whitespace', () => {
    expect(() => validateSubmitInput({ ...valid, title: '  \t  ' })).toThrow('title is required')
  })

  it('throws when source exceeds cap', () => {
    const overCap = 'x'.repeat(SUBMIT_LIMITS.source + 1)
    expect(() => validateSubmitInput({ ...valid, source: overCap })).toThrow('source too large')
  })

  it('passes when source is exactly at the cap', () => {
    const atCap = 'x'.repeat(SUBMIT_LIMITS.source)
    expect(() => validateSubmitInput({ ...valid, source: atCap })).not.toThrow()
  })

  it('throws when title exceeds cap', () => {
    const overCap = 'x'.repeat(SUBMIT_LIMITS.title + 1)
    expect(() => validateSubmitInput({ ...valid, title: overCap })).toThrow('title too long')
  })

  it('passes when title is exactly at the cap', () => {
    const atCap = 'x'.repeat(SUBMIT_LIMITS.title)
    expect(() => validateSubmitInput({ ...valid, title: atCap })).not.toThrow()
  })

  it('throws when description exceeds cap', () => {
    const overCap = 'x'.repeat(SUBMIT_LIMITS.description + 1)
    expect(() => validateSubmitInput({ ...valid, description: overCap })).toThrow(
      'description too long',
    )
  })

  it('passes when description is exactly at the cap', () => {
    const atCap = 'x'.repeat(SUBMIT_LIMITS.description)
    expect(() => validateSubmitInput({ ...valid, description: atCap })).not.toThrow()
  })
})
