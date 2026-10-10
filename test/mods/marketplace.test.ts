import { describe, expect, it } from 'vitest'
import {
  buildMarketplace,
  type MarketplaceModRow,
  marketplaceFetchedEvent,
} from '@/mods/marketplace'

const ORIGIN = 'https://statuslin.es'
const SHA = 'a'.repeat(40)

function row(overrides: Partial<MarketplaceModRow> = {}): MarketplaceModRow {
  return {
    slug: 'meter',
    pluginName: 'meter',
    description: 'A context meter',
    authorGithub: 'octocat',
    tags: ['minimal', 'git'],
    repoUrl: 'https://github.com/octocat/meter',
    path: '',
    commitSha: SHA,
    license: 'MIT',
    ...overrides,
  }
}

describe('buildMarketplace', () => {
  it('names and describes the marketplace, names an owner, and force-removes delisted plugins', () => {
    const marketplace = buildMarketplace(ORIGIN, [])

    expect(marketplace).toEqual({
      name: 'statuslines',
      description: 'Claude Code mods from the statuslin.es gallery, each pinned to a commit.',
      owner: { name: 'statuslin.es', email: 'hello@statuslin.es' },
      forceRemoveDeletedPlugins: true,
      plugins: [],
    })
  })

  it('points a plugin at the repo root with a url source pinned to its commit', () => {
    const [plugin] = buildMarketplace(ORIGIN, [row()]).plugins

    expect(plugin).toEqual({
      name: 'meter',
      source: { source: 'url', url: 'https://github.com/octocat/meter.git', sha: SHA },
      description: 'A context meter',
      author: { name: 'octocat' },
      homepage: 'https://statuslin.es/mods/meter',
      license: 'MIT',
      keywords: ['minimal', 'git'],
    })
  })

  it('points a plugin in a folder at a git-subdir source with its path', () => {
    const [plugin] = buildMarketplace(ORIGIN, [
      row({ repoUrl: 'https://github.com/octocat/mods', path: 'plugins/meter' }),
    ]).plugins

    expect(plugin?.source).toEqual({
      source: 'git-subdir',
      url: 'https://github.com/octocat/mods.git',
      path: 'plugins/meter',
      sha: SHA,
    })
  })

  it('builds the homepage from the site origin and the mod slug, not the plugin name', () => {
    const [plugin] = buildMarketplace('https://staging.statuslin.es', [
      row({ slug: 'context-meter', pluginName: 'meter' }),
    ]).plugins

    expect(plugin?.homepage).toBe('https://staging.statuslin.es/mods/context-meter')
  })

  it('omits license when the version has none', () => {
    const [plugin] = buildMarketplace(ORIGIN, [row({ license: null })]).plugins

    expect(plugin).not.toHaveProperty('license')
  })

  it('keeps the rows in the order given', () => {
    const names = buildMarketplace(ORIGIN, [
      row({ slug: 'b', pluginName: 'b' }),
      row({ slug: 'a', pluginName: 'a' }),
    ]).plugins.map((p) => p.name)

    expect(names).toEqual(['b', 'a'])
  })
})

describe('marketplaceFetchedEvent', () => {
  it('records the fetch with the number of listed plugins, without a person profile', () => {
    expect(marketplaceFetchedEvent(3)).toEqual({
      event: 'marketplace_fetched',
      distinctId: 'marketplace',
      properties: { pluginCount: 3, $process_person_profile: false },
    })
  })
})
