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

// Review is agent-assisted: a person approves every listing, but agents help check the code, so
// no page may claim a person read it all. Say it was reviewed. The admin review screens and
// comments can still talk about the person reviewing.
const PERSON_READ_CLAIM =
  /\b(?:a person (?:reads|reviews|read)|read by a person|reviewed by a person|human review|a person reads it)\b/i
const ADMIN_ONLY = /^src\/(?:review|routes\/admin)/
const COMMENT = /^\s*(?:\/\/|\*|\/\*)/

describe('review claims in site copy', () => {
  it('never say a person read or reviews every status line or mod', () => {
    const offenders = sourceFiles('src')
      .filter((path) => !ADMIN_ONLY.test(path))
      .flatMap((path) =>
        readFileSync(path, 'utf8')
          .split('\n')
          .flatMap((line, i) =>
            !COMMENT.test(line) && PERSON_READ_CLAIM.test(line) ? [`${path}:${i + 1}`] : [],
          ),
      )
    expect(offenders, 'say it was reviewed instead, on these lines').toEqual([])
  })
})
