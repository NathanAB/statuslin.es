import { describe, expect, it } from 'vitest'
import { coerceInterpreter } from '@/gallery/queries'

describe('coerceInterpreter', () => {
  it('passes through "bash"', () => {
    expect(coerceInterpreter('bash')).toBe('bash')
  })

  it('passes through "node"', () => {
    expect(coerceInterpreter('node')).toBe('node')
  })

  it('passes through "python"', () => {
    expect(coerceInterpreter('python')).toBe('python')
  })

  it('falls back to "bash" for an unknown string', () => {
    expect(coerceInterpreter('ruby')).toBe('bash')
    expect(coerceInterpreter('deno')).toBe('bash')
  })

  it('falls back to "bash" for an empty string', () => {
    expect(coerceInterpreter('')).toBe('bash')
  })
})
