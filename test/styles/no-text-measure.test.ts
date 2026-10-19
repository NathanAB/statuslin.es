import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

// Text fills its container (docs/frontend-guidelines.md): the owner removed line-length caps and
// doesn't want them back. A cap is a max width in text units (ch, em) or Tailwind's prose width.
describe('text width', () => {
  it('is never capped to a line length', () => {
    const cap = /\bmax-w-(?:\[[\d.]+(?:ch|em)\]|prose)(?![\w-])/
    const offenders = sourceFiles('src').flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, i) => (cap.test(line) ? [`${path}:${i + 1}`] : [])),
    )
    expect(offenders, 'let the text fill its container on these lines').toEqual([])
  })
})
