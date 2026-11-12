import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseUnreviewed, UNREVIEWED_FILE } from '@/mods/unreviewed'

const SHA = 'a'.repeat(40)

const entry = (overrides: Record<string, unknown> = {}) => ({
  repoUrl: 'https://github.com/octocat/meter',
  path: 'mods/meter',
  commitSha: SHA,
  pluginName: 'meter',
  ...overrides,
})

function errorsFor(entries: unknown): string[] {
  const result = parseUnreviewed(entries)
  if (result.ok) throw new Error('expected the file to be refused')
  return result.errors
}

describe('parseUnreviewed', () => {
  it('accepts a clean entry', () => {
    expect(parseUnreviewed([entry()])).toEqual({ ok: true, entries: [entry()] })
  })

  it('parses the committed file', () => {
    expect(parseUnreviewed(JSON.parse(readFileSync(UNREVIEWED_FILE, 'utf8'))).ok).toBe(true)
  })

  it('checks each field by the curation file rules', () => {
    expect(
      errorsFor([entry({ commitSha: 'abc', repoUrl: 'https://gitlab.com/o/r', path: '../x' })]),
    ).toEqual([
      'entry 1 (meter) repoUrl: must be an https://github.com/<owner>/<repo> URL',
      'entry 1 (meter) path: must be "" or "/"-separated names of letters, digits, ".", "_" and "-", without "." or ".."',
      'entry 1 (meter) commitSha: must be a full 40-character lowercase hex commit SHA',
    ])
  })

  it('refuses fields a curated entry has and an unreviewed one does not', () => {
    expect(errorsFor([entry({ title: 'Meter' })])).toEqual([
      'entry 1 (meter) : Unrecognized key: "title"',
    ])
  })

  it('refuses a second entry for one owner and plugin name, whatever the case', () => {
    expect(
      errorsFor([entry(), entry({ repoUrl: 'https://github.com/OctoCat/meters', path: '' })]),
    ).toEqual(['entry 2 (meter): octocat/meter is already entry 1'])
  })

  it('refuses a second entry for one plugin folder', () => {
    expect(errorsFor([entry(), entry({ pluginName: 'meter2' })])).toEqual([
      'entry 2 (meter2): https://github.com/octocat/meter at mods/meter is already entry 1',
    ])
  })

  it('refuses a file that is not a list', () => {
    expect(errorsFor({})).toEqual([`${UNREVIEWED_FILE} must be a JSON array`])
  })
})
