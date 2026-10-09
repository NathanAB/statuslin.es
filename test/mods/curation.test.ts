import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CURATION_FILE, parseCuration } from '@/mods/curation'
import { DESKTOP_SCREENSHOT_SIZE } from '@/mods/mod-preview'

const SHA = 'a'.repeat(40)
const SCREENSHOT_ERROR = /desktopScreenshot: must be a site path under \/mods\/ ending in \.png/

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
    '/mods/statusline-anywhere-desktop.png',
    '/mods/screenshots/meter.png',
  ])('keeps a Desktop screenshot at %s', (desktopScreenshot) => {
    const result = parseCuration([entry({ desktopScreenshot })])

    expect(result.ok && result.entries[0]?.desktopScreenshot).toBe(desktopScreenshot)
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
    ['a screenshot outside /mods/', { desktopScreenshot: '/fonts/meter.png' }, SCREENSHOT_ERROR],
    ['a screenshot that is not a PNG', { desktopScreenshot: '/mods/meter.jpg' }, SCREENSHOT_ERROR],
    ['a relative screenshot path', { desktopScreenshot: 'mods/meter.png' }, SCREENSHOT_ERROR],
    ['a screenshot URL', { desktopScreenshot: 'https://x.test/mods/a.png' }, SCREENSHOT_ERROR],
    ['a ".." screenshot segment', { desktopScreenshot: '/mods/../meter.png' }, SCREENSHOT_ERROR],
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

  it('points every committed screenshot at a file in public/ of the size the mod page reserves', () => {
    const result = parseCuration(JSON.parse(readFileSync(CURATION_FILE, 'utf8')))
    const screenshots = result.ok ? result.entries.flatMap((e) => e.desktopScreenshot ?? []) : []

    expect(screenshots).toContain('/mods/statusline-anywhere-desktop.png')
    expect(screenshots.filter((path) => !existsSync(`public${path}`))).toEqual([])
    for (const path of screenshots) {
      const png = readFileSync(`public${path}`)
      const size = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
      expect(size, path).toEqual(DESKTOP_SCREENSHOT_SIZE)
    }
  })
})
