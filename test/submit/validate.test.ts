import { describe, expect, it } from 'vitest'
import { HttpError } from '@/lib/http'
import { SUBMIT_LIMITS, validateSubmitInput } from '@/submit/submit'

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
      'Interpreter must be bash, node or python',
    )
    expect(() => validateSubmitInput({ ...valid, interpreter: '' })).toThrow(
      'Interpreter must be bash, node or python',
    )
    expect(() => validateSubmitInput({ ...valid, interpreter: 'zsh' })).toThrow(
      'Interpreter must be bash, node or python',
    )
  })

  it('throws when source is empty string', () => {
    expect(() => validateSubmitInput({ ...valid, source: '' })).toThrow('Source code is required')
  })

  it('throws when source is only whitespace', () => {
    expect(() => validateSubmitInput({ ...valid, source: '   ' })).toThrow(
      'Source code is required',
    )
  })

  it('throws when title is empty string', () => {
    expect(() => validateSubmitInput({ ...valid, title: '' })).toThrow('Title is required')
  })

  it('throws when title is only whitespace', () => {
    expect(() => validateSubmitInput({ ...valid, title: '  \t  ' })).toThrow('Title is required')
  })

  it('throws when source exceeds cap', () => {
    const overCap = 'x'.repeat(SUBMIT_LIMITS.source + 1)
    expect(() => validateSubmitInput({ ...valid, source: overCap })).toThrow(
      'Source code is over 100,000 characters',
    )
  })

  it('passes when source is exactly at the cap', () => {
    const atCap = 'x'.repeat(SUBMIT_LIMITS.source)
    expect(() => validateSubmitInput({ ...valid, source: atCap })).not.toThrow()
  })

  it('throws when title exceeds cap', () => {
    const overCap = 'x'.repeat(SUBMIT_LIMITS.title + 1)
    expect(() => validateSubmitInput({ ...valid, title: overCap })).toThrow(
      'Title is over 200 characters',
    )
  })

  it('passes when title is exactly at the cap', () => {
    const atCap = 'x'.repeat(SUBMIT_LIMITS.title)
    expect(() => validateSubmitInput({ ...valid, title: atCap })).not.toThrow()
  })

  it('throws when description exceeds cap', () => {
    const overCap = 'x'.repeat(SUBMIT_LIMITS.description + 1)
    expect(() => validateSubmitInput({ ...valid, description: overCap })).toThrow(
      'Description is over 4,000 characters',
    )
  })

  it('passes when description is exactly at the cap', () => {
    const atCap = 'x'.repeat(SUBMIT_LIMITS.description)
    expect(() => validateSubmitInput({ ...valid, description: atCap })).not.toThrow()
  })
})
