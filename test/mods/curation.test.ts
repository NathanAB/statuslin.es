import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CURATION_FILE, parseCuration } from '@/mods/curation'

const SHA = 'a'.repeat(40)

const entry = (overrides: Record<string, unknown> = {}) => ({
  repoUrl: 'https://github.com/octocat/meter',
  path: 'mods/meter',
  commitSha: SHA,
  pluginName: 'meter',
  title: 'Meter',
  ...overrides,
})

function errorsFor(entries: unknown[]): string[] {
  const result = parseCuration(entries)
  if (result.ok) throw new Error('expected the curation file to be refused')
  return result.errors
}

describe('parseCuration', () => {
  it('accepts a clean entry and defaults its input steps to none', () => {
    expect(parseCuration([entry()])).toEqual({
      ok: true,
      entries: [{ ...entry(), inputSteps: [] }],
    })
  })

  it('keeps text input steps, including one typed without Enter', () => {
    const inputSteps = [
      { type: 'text', text: '/radar' },
      { type: 'text', text: 'look at [Image #1]', submit: false },
    ]

    const result = parseCuration([entry({ inputSteps })])

    expect(result.ok && result.entries[0]?.inputSteps).toEqual(inputSteps)
  })

  it.each([
    ['a short SHA', { commitSha: 'abc1234' }, /commitSha.*40/],
    ['an uppercase SHA', { commitSha: 'A'.repeat(40) }, /commitSha.*40/],
    ['a non-https URL', { repoUrl: 'http://github.com/octocat/meter' }, /repoUrl.*https/],
    ['a non-GitHub URL', { repoUrl: 'https://gitlab.com/octocat/meter' }, /repoUrl.*github/],
    ['a .git URL', { repoUrl: 'https://github.com/octocat/meter.git' }, /repoUrl.*\.git/],
    ['a plugin name with a space', { pluginName: 'my meter' }, /pluginName/],
    ['a plugin name starting with a dot', { pluginName: '.meter' }, /pluginName/],
    ['a path segment starting with "-"', { path: 'mods/-meter' }, /path.*"-"/],
    ['a ".." path segment', { path: 'mods/../meter' }, /path/],
    ['a trailing slash in the path', { path: 'mods/meter/' }, /path/],
    ['an empty title', { title: ' ' }, /title/],
    [
      'a hand-made Desktop screenshot, which render:mods now records',
      { desktopScreenshot: '/mods/meter.png' },
      /desktopScreenshot/,
    ],
  ])('refuses %s', (_name, overrides, message) => {
    const errors = errorsFor([entry(overrides)])

    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(message)
  })

  it('names the entry an error belongs to', () => {
    const errors = errorsFor([entry(), entry({ pluginName: 'gauge', commitSha: 'abc' })])

    expect(errors[0]).toMatch(/entry 2 \(gauge\)/)
  })

  it('refuses a plugin name used twice in the file', () => {
    const errors = errorsFor([entry(), entry({ path: 'mods/meter-2' })])

    expect(errors).toEqual([expect.stringMatching(/entry 2 \(meter\).*"meter".*entry 1/)])
  })

  it('refuses a file that is not a list', () => {
    expect(errorsFor({ mods: [] } as unknown as unknown[])).toHaveLength(1)
  })

  it('parses the committed curation file', () => {
    const result = parseCuration(JSON.parse(readFileSync(CURATION_FILE, 'utf8')))

    expect(result.ok ? [] : result.errors).toEqual([])
  })
})
