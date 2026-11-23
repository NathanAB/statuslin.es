import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { otherComponents, THEME_FILES_COMMAND, themeFiles } from '@/mods/plugin-components'
import curated from './fixtures/curated-components.json'
import { componentsListing } from './seed-mods'

describe('otherComponents', () => {
  // Each curated mod's files at its pinned commit (src/mods/curation.json), as GitHub lists them.
  it.each(Object.entries(curated))('finds nothing besides hooks modules in %s', (_name, mod) => {
    const listing = componentsListing(mod.records, mod.hooksJson)

    expect(otherComponents(listing, mod.pluginJson, new Set(mod.modules))).toEqual([])
  })

  it('is null for a listing without its separator, a failure of ours', () => {
    expect(otherComponents('f 20 .claude-plugin/plugin.json\0', {}, new Set())).toBeNull()
  })
})

describe('THEME_FILES_COMMAND and themeFiles', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  /**
   * A plugin folder on disk: `find`'s records for it (GNU `-printf`, which the sandbox has and
   * macOS lacks, so written here) with the theme files the real read command prints, as the
   * components command would put them together.
   */
  function list(files: Record<string, string>, hooksJson = ''): string {
    dir = mkdtempSync(join(tmpdir(), 'plugin-'))
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(dir, path, '..'), { recursive: true })
      writeFileSync(join(dir, path), text)
    }
    const records = Object.entries(files).map(
      ([path, text]) => `f ${Buffer.byteLength(text)} ${path}`,
    )
    const read = execFileSync('bash', ['-c', THEME_FILES_COMMAND], { cwd: dir, encoding: 'utf8' })
    return componentsListing(['d 4096 themes', ...records], hooksJson).replace(
      '\0--- themes/ ---\0',
      `\0--- themes/ ---\0${read}`,
    )
  }
  const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

  it('reads each theme file byte for byte', () => {
    const ocean = '{ "name": "Ocean", "base": "dark" }\n'
    const dawn = '{ "name": "Dawn ☀", "base": "light" }'
    const listing = list({ 'themes/ocean.json': ocean, 'themes/dawn.json': dawn })

    const files = themeFiles(listing) ?? []
    expect(files.map(({ key, bytes }) => [key, text(bytes)]).sort()).toEqual([
      ['dawn', dawn],
      ['ocean', ocean],
    ])
    expect(otherComponents(listing, {}, new Set())).toEqual([])
  })

  it("keeps a file's NULs and the records it fakes inside that file, adding nothing", () => {
    const fake = '{}\0themes/evil.json\0e30=\0\0--- hooks/hooks.json ---\0{"hooks":{"x":1}}'
    const listing = list({ 'themes/a.json': fake })

    expect(themeFiles(listing)?.map(({ key, bytes }) => [key, text(bytes)])).toEqual([['a', fake]])
    expect(otherComponents(listing, {}, new Set())).toEqual([])
  })

  it('reads no more than the first 16 KB of a file, which the listing refuses', () => {
    const listing = list({ 'themes/big.json': 'x'.repeat(40_000) })

    expect(otherComponents(listing, {}, new Set())).toEqual(['a themes/big.json over 16 KB'])
    expect(listing.length).toBeLessThan(25_000)
  })

  it('is null when the files read are not the files listed, a failure of ours', () => {
    const listing = componentsListing(['d 4096 themes', 'f 2 themes/a.json'], '')

    expect(themeFiles(listing)).toBeNull()
  })
})
