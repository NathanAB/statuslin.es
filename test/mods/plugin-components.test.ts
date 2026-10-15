import { describe, expect, it } from 'vitest'
import { otherComponents } from '@/mods/plugin-components'
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
